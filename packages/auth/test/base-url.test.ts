import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 배포 주소 해석은 auth 인스턴스를 만들 때 한 번 평가된다.
 * 환경변수를 바꾼 뒤 모듈을 다시 불러와야 한다.
 */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, '');
    else vi.stubEnv(key, value);
  }
  return import('../src/index');
}

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-value-32-chars-long!!');
  vi.stubEnv('DATABASE_URL', 'postgresql://x:y@localhost:5432/z');
});
afterEach(() => vi.unstubAllEnvs());

describe('배포 주소', () => {
  it('명시값이 있으면 그것을 쓴다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: 'https://shop.example.com',
      VERCEL_URL: 'preview-abc.vercel.app',
    });
    expect(auth.options.baseURL).toBe('https://shop.example.com');
  });

  it('명시값이 없으면 이 배포의 주소를 쓴다', async () => {
    // 운영 도메인을 상수로 박으면 프리뷰마다 Origin 이 어긋나 로그인이 막힌다
    const { auth } = await load({
      BETTER_AUTH_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: 'preview-abc.vercel.app',
    });
    expect(auth.options.baseURL).toBe('https://preview-abc.vercel.app');
  });

  it('둘 다 없으면 비워 둔다 — 로컬에서는 현재 출처를 쓴다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined, VERCEL_URL: undefined,
    });
    expect(auth.options.baseURL).toBeUndefined();
  });
});

describe('신뢰 출처', () => {
  it('Capacitor 웹뷰를 포함한다', async () => {
    // 앱의 origin 은 capacitor:// 라 기본 검사에 걸린다
    const { auth } = await load({ BETTER_AUTH_URL: 'https://shop.example.com' });
    expect(auth.options.trustedOrigins).toContain('capacitor://localhost');
  });

  it('자기 자신을 신뢰한다', async () => {
    const { auth } = await load({ BETTER_AUTH_URL: 'https://shop.example.com' });
    expect(auth.options.trustedOrigins).toContain('https://shop.example.com');
  });

  it('프리뷰 배포도 자기 주소를 신뢰한다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: 'https://shop.example.com',
      VERCEL_URL: 'preview-abc.vercel.app',
    });
    expect(auth.options.trustedOrigins).toContain('https://preview-abc.vercel.app');
  });

  it('중복을 남기지 않는다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_URL: 'preview-abc.vercel.app',
    });
    const origins = auth.options.trustedOrigins as string[];
    expect(origins.length).toBe(new Set(origins).size);
  });
});
