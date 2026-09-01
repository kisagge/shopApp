import { describe, it, expect } from 'vitest';
import { readS3Config } from '~/lib/storage';

const full = {
  S3_BUCKET: 'shop-media',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
  S3_PUBLIC_BASE_URL: 'https://cdn.test/shop-media',
} as NodeJS.ProcessEnv;

describe('스토리지 설정 읽기', () => {
  it('네 값이 모두 있으면 설정을 준다', () => {
    expect(readS3Config(full)).toMatchObject({ bucket: 'shop-media' });
  });

  it.each(Object.keys(full))('%s 가 없으면 설정으로 치지 않는다', (missing) => {
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
