import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  readS3Config, StorageError, getStorage, setStorage, isStorageConfigured,
  type StorageAdapter,
} from '~/lib/storage';

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

describe('어느 저장소를 받는가', () => {
  /*
   * **설정이 없으면 동작하는 척하지 않는다.** 조용히 성공한 척하면 운영자는
   * 사진을 올리고 "됐다" 를 보는데 그 파일은 어디에도 없다 — 상품 화면에
   * 깨진 그림이 남고, 그때는 어느 단계에서 사라졌는지 알 길이 없다.
   *
   * 그리고 이 판단이 **올리기 칸을 아예 보일지**까지 정한다
   * (`isStorageConfigured` — 운영 상품·브랜드 화면, 손님의 문의 사진).
   */
  const KEEP = { ...process.env };

  afterEach(() => {
    process.env = { ...KEEP };
    setStorage(undefined);
  });

  function env(patch: NodeJS.ProcessEnv | null): void {
    setStorage(undefined);
    for (const key of Object.keys(full)) delete process.env[key];
    if (patch) Object.assign(process.env, patch);
  }

  it('네 값이 다 있으면 S3 창구를 준다', () => {
    env(full);

    expect(getStorage().name).toBe('s3');
  });

  it('설정이 없으면 설정 안 됨 창구를 준다 — 성공한 척하는 창구가 아니다', () => {
    env(null);

    expect(getStorage().name).toBe('unconfigured');
  });

  it('반쯤 채운 설정도 설정 안 됨이다 — 모르는 채로 실패하지 않게', () => {
    env({ NODE_ENV: 'test', S3_BUCKET: 'shop-media' });

    expect(getStorage().name).toBe('unconfigured');
  });

  it('한 번 고른 창구를 다시 쓴다', () => {
    env(full);

    expect(getStorage()).toBe(getStorage());
  });

  it('검사가 갈아 끼운 창구가 먼저다 — 환경을 보지 않는다', () => {
    env(full);
    const mine = { name: 'mine', put: vi.fn(), remove: vi.fn() };
    setStorage(mine);

    expect(getStorage()).toBe(mine);
  });

  it.each([
    ['올리기', (s: StorageAdapter) => s.put({ key: 'a.jpg', body: new Uint8Array(), contentType: 'image/jpeg' })],
    ['지우기', (s: StorageAdapter) => s.remove('a.jpg')],
  ])('설정이 없으면 %s 를 분명히 거절한다 — 503 이다', async (_what, call) => {
    env(null);

    await expect(call(getStorage())).rejects.toMatchObject({
      name: 'StorageError',
      code: 'NOT_CONFIGURED',
      status: 503,
    });
  });

  it('거절하면서 무엇을 확인해야 하는지 말한다', async () => {
    /* 열쇠 이름을 적어 주지 않으면 운영자는 어디를 봐야 할지 모른다 */
    env(null);

    await expect(
      getStorage().put({ key: 'a.jpg', body: new Uint8Array(), contentType: 'image/jpeg' }),
    ).rejects.toThrow(/S3_BUCKET/);
  });

  it.each([
    ['설정이 있으면', full, true],
    ['없으면', null, false],
  ])('%s 올리기 칸을 보일지 그대로 말한다', (_what, patch, expected) => {
    env(patch);

    expect(isStorageConfigured()).toBe(expected);
  });
});
