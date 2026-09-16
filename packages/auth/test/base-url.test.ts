import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

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

/**
 * **처음 한 번의 import 값을 검사 밖에서 치른다.**
 *
 * 이 파일도 첫 검사만 660ms 고 나머지는 6ms 다 — 그 차이가 전부 `@shop/auth`
 * 를 처음 불러오는 값이다. 검사 안에 두면 부하가 걸릴 때 첫 검사만 시간
 * 초과로 진다. `resetModules` 는 등록부만 비우고 변환 결과는 남으므로,
 * 미리 한 번 읽어 두면 뒤의 `load()` 들이 값을 안 치른다.
 */
beforeAll(async () => {
  await load({});
  vi.unstubAllEnvs();
  // 이 준비는 재는 대상이 아니다. 훅의 기본 상한 10초로는 부하가 걸린
  // CI 에서 모자랐다 — 실제로 그렇게 졌다.
}, 60_000);

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

  it('프리뷰에서는 그 배포의 주소를 쓴다', async () => {
    // 운영 도메인을 상수로 박으면 프리뷰마다 Origin 이 어긋나 로그인이 막힌다
    const { auth } = await load({
      BETTER_AUTH_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'preview-abc.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'shop.vercel.app',
    });
    expect(auth.options.baseURL).toBe('https://preview-abc.vercel.app');
  });

  it('운영에서는 안정 도메인을 쓴다 — 배포별 주소가 아니다', async () => {
    // VERCEL_URL 은 배포마다 바뀌므로, 사용자가 실제로 접속하는 주소와
    // 어긋나 Invalid origin 이 난다. 실제로 그렇게 막혔다.
    const { auth } = await load({
      BETTER_AUTH_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_ENV: 'production',
      VERCEL_URL: 'shop-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'plain-shop-byjang.vercel.app',
    });
    expect(auth.options.baseURL).toBe('https://plain-shop-byjang.vercel.app');
  });

  it('둘 다 없으면 비워 둔다 — 로컬에서는 현재 출처를 쓴다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined, VERCEL_URL: undefined,
      VERCEL_ENV: undefined, VERCEL_PROJECT_PRODUCTION_URL: undefined,
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

  it('배포를 가리키는 주소를 모두 신뢰한다', async () => {
    // 한 배포가 안정 도메인·브랜치 별칭·배포별 주소로 동시에 열린다.
    // 어느 쪽으로 들어와도 로그인이 돼야 한다.
    const { auth } = await load({
      BETTER_AUTH_URL: 'https://shop.example.com',
      VERCEL_ENV: 'production',
      VERCEL_URL: 'shop-abc123.vercel.app',
      VERCEL_BRANCH_URL: 'shop-git-main.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'plain-shop-byjang.vercel.app',
    });
    const origins = auth.options.trustedOrigins;
    expect(origins).toContain('https://shop-abc123.vercel.app');
    expect(origins).toContain('https://shop-git-main.vercel.app');
    expect(origins).toContain('https://plain-shop-byjang.vercel.app');
  });

  it('운영 도메인을 명시하지 않아도 그 주소를 신뢰한다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_ENV: 'production',
      VERCEL_URL: 'shop-abc123.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'plain-shop-byjang.vercel.app',
    });
    expect(auth.options.trustedOrigins).toContain('https://plain-shop-byjang.vercel.app');
  });

  it('중복을 남기지 않는다', async () => {
    const { auth } = await load({
      BETTER_AUTH_URL: undefined, NEXT_PUBLIC_APP_URL: undefined,
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'preview-abc.vercel.app',
    });
    const origins = auth.options.trustedOrigins;
    expect(origins.length).toBe(new Set(origins).size);
  });
});

describe('로그인 요청 제한', () => {
  it('기본은 켜져 있다 — 무차별 대입을 막는 최소한이다', async () => {
    delete process.env['AUTH_RATE_LIMIT'];
    const { rateLimitEnabled } = await import('../src/index');
    expect(rateLimitEnabled()).toBe(true);
  });

  it('아무 값이나로는 꺼지지 않는다', async () => {
    const { rateLimitEnabled } = await import('../src/index');
    for (const value of ['false', '0', 'no', 'disabled', '']) {
      process.env['AUTH_RATE_LIMIT'] = value;
      expect(rateLimitEnabled()).toBe(true);
    }
  });

  it("정확히 'off' 일 때만 꺼진다 — E2E 전용이다", async () => {
    const { rateLimitEnabled } = await import('../src/index');
    process.env['AUTH_RATE_LIMIT'] = 'off';
    expect(rateLimitEnabled()).toBe(false);
    delete process.env['AUTH_RATE_LIMIT'];
  });
});
