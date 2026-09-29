import { describe, it, expect } from 'vitest';
import { readS3Config, StorageError } from '~/lib/storage';

// ProcessEnv 는 NODE_ENV 를 요구한다. 설정 읽기가 보는 것은 S3_* 뿐이다.
const full: NodeJS.ProcessEnv = {
  NODE_ENV: 'test',
  S3_BUCKET: 'shop-media',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'https://cdn.test/shop-media',
};

describe('스토리지 설정 읽기', () => {
  it('네 값이 모두 있으면 설정을 준다', () => {
    expect(readS3Config(full)).toMatchObject({ bucket: 'shop-media' });
  });

  // NODE_ENV 는 ProcessEnv 타입이 요구할 뿐 설정 읽기와 무관하다.
  // 필수 키만 돌려야 "하나라도 빠지면 꺼진다" 를 실제로 검증한다.
  const REQUIRED = ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'];

  it.each(REQUIRED)('%s 가 없으면 설정으로 치지 않는다', (missing) => {
    // 반쯤 채워진 설정으로 실제 스토리지를 두드리면 무슨 일이 일어나는지
    // 모르는 채로 실패한다. 토스 키에서 이미 겪은 문제다.
    const partial = { ...full };
    delete partial[missing];
    expect(readS3Config(partial)).toBeNull();
  });

  it('빈 문자열도 없는 것으로 본다', () => {
    expect(readS3Config({ ...full, S3_BUCKET: '' })).toBeNull();
  });

  it('공개 주소 끝의 슬래시를 정리한다', () => {
    // 붙는 쪽과 안 붙는 쪽이 섞이면 // 가 든 URL 이 저장된다
    expect(readS3Config({ ...full, S3_PUBLIC_BASE_URL: 'https://cdn.test/b///' })?.publicBaseUrl)
      .toBe('https://cdn.test/b');
  });

  it('MinIO 를 위해 path-style 이 기본이다', () => {
    expect(readS3Config(full)?.forcePathStyle).toBe(true);
  });

  it('AWS S3 면 명시적으로 끌 수 있다', () => {
    expect(readS3Config({ ...full, S3_FORCE_PATH_STYLE: 'false' })?.forcePathStyle).toBe(false);
  });

  it('엔드포인트가 없으면 undefined — AWS 기본 엔드포인트를 쓴다', () => {
    expect(readS3Config(full)?.endpoint).toBeUndefined();
  });

  it('리전 기본값이 있다', () => {
    expect(readS3Config(full)?.region).toBe('ap-northeast-2');
  });
});

/**
 * **설정 문제는 500 이 아니다.** 열쇠가 없어서 못 올린 것과 저장소가 넘어진 것은 고칠 사람도, 다시
 * 시도할지 여부도 다르다. 이 셈을 라우트 여섯 곳이 각자 하고 있었고, 새 업로드 창구를 만들 때마다
 * 한 곳씩 더 복사됐다 — 오류가 스스로 알면 공통 응답이 그대로 옮겨 준다.
 */
describe('스토리지 오류의 상태 코드', () => {
  it('설정이 없는 것은 503 — 아직 준비가 안 된 것이다', () => {
    expect(new StorageError('NOT_CONFIGURED', '스토리지 설정이 없습니다').status).toBe(503);
  });

  it.each(['PUT_FAILED', 'DELETE_FAILED'] as const)('%s 는 502 — 밖이 넘어졌다', (code) => {
    expect(new StorageError(code, '올리지 못했습니다').status).toBe(502);
  });

  it('코드와 문구를 그대로 지닌다 — 공통 응답이 이 셋을 읽는다', () => {
    const error = new StorageError('PUT_FAILED', '올리지 못했습니다');
    expect({ code: error.code, message: error.message, status: error.status })
      .toEqual({ code: 'PUT_FAILED', message: '올리지 못했습니다', status: 502 });
  });
});
