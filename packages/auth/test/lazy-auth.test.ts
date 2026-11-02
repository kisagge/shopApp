import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

/**
 * **auth 인스턴스는 import 가 아니라 처음 쓸 때 만든다.**
 *
 * 예전에는 `betterAuth(options)` 를 모듈 최상단에서 바로 불렀다. 그러면 이 모듈을 import
 * 하는 것만으로 better-auth 가 초기화되고, prisma 어댑터가 데이터 모델을 읽으려 `prisma` 의
 * 속성을 만진다 — `packages/db` 의 Proxy 가 그때 클라이언트를 만들고, `DATABASE_URL` 이
 * 없으면 **거기서 터진다.**
 *
 * 그래서 **DB 를 쓰지도 않는 검사가 거짓으로 졌다.** `apps/web` 에서 `vitest run` 을 그냥
 * 돌리면 언어 고르기 창구 검사 아홉이 그렇게 지고, 게이트는 폐기용 DB 주소를 넣어 주니
 * 거기서는 조용했다. 단독 실행이 거짓 실패를 내면 **돌연변이로 무엇을 재든 신호와 잡음을
 * 가를 수 없다** — 실제로 한 번 잘못 읽었고, 그걸 알아내는 데 품이 들었다.
 *
 * 되돌아오기 쉬운 자리다. `export const auth = betterAuth(options)` 한 줄이 가장 자연스러워
 * 보이기 때문이다.
 *
 * **"던지는가" 로는 못 잡는다.** better-auth 의 초기화가 비동기라, 즉시 생성으로 되돌려도
 * import 는 멀쩡히 끝나고 터지는 것은 한참 뒤의 처리 안 된 거절이다(처음 이 검사를 그렇게
 * 썼다가 돌연변이에서 안 잡히는 것을 보고 알았다). 그래서 **prisma 를 만졌는지를 센다** —
 * 가짜 prisma 를 끼워 접근을 기록한다.
 */

const SECRET = 'test-secret-value-32-chars-long!!';
const DB_URL = 'postgresql://x:y@localhost:5432/z';

/** 접근을 기록하는 가짜 prisma 로 모듈을 새로 불러온다 */
async function loadWithSpy(databaseUrl: string) {
  const touched: string[] = [];
  vi.resetModules();
  vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.doMock('@shop/db', () => ({
    prisma: new Proxy({}, {
      get(_target, prop) {
        touched.push(String(prop));
        return undefined;
      },
    }),
    Prisma: {},
  }));
  const mod = await import('../src/index');
  return { ...mod, touched };
}

/** 진짜 `@shop/db` 로 — 가드가 살아 있는지 보는 검사가 쓴다 */
async function loadReal(databaseUrl: string) {
  vi.resetModules();
  vi.doUnmock('@shop/db');
  vi.stubEnv('BETTER_AUTH_SECRET', SECRET);
  vi.stubEnv('DATABASE_URL', databaseUrl);
  return import('../src/index');
}

/**
 * 처음 한 번의 import 값을 검사 밖에서 치른다 — base-url 검사가 적어 둔 것과 같은 까닭이다.
 * 여기서 재는 것은 시간이 아니라 접근 횟수지만, 첫 import 는 여전히 무겁다.
 */
beforeAll(async () => {
  await loadReal(DB_URL);
  vi.unstubAllEnvs();
}, 60_000);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@shop/db');
});

describe('auth 인스턴스는 처음 쓸 때 만든다', () => {
  it('import 만으로는 DB 를 만지지 않는다', async () => {
    const { touched } = await loadWithSpy('');

    expect(touched, 'import 때 prisma 를 만지면 DATABASE_URL 없는 곳에서 거짓 실패가 난다')
      .toEqual([]);
  });

  it('처음 쓸 때 만든다', async () => {
    const mod = await loadWithSpy(DB_URL);

    void mod.auth.options;

    expect(mod.touched.length, '쓰는데도 안 만들면 게으른 것이 아니라 고장이다')
      .toBeGreaterThan(0);
  });

  /** 쓸 때마다 새로 만들면 왕복이 쌓인다 — 두 번째 접근은 아무것도 더 만지지 않아야 한다 */
  it('두 번 써도 한 번만 만든다', async () => {
    const mod = await loadWithSpy(DB_URL);

    void mod.auth.options;
    const first = mod.touched.length;
    void mod.auth.options;

    expect(mod.touched.length).toBe(first);
  });

  /**
   * **가드를 없앤 것이 아니다.** 게으르게 만든 것은 "언제 만드는가" 뿐이고, 실제로 쓰는
   * 순간에는 그대로 막힌다. 비동기로 오므로 불러서 기다린다.
   */
  it('DB 주소가 없으면 쓰는 순간에 막힌다', async () => {
    const { auth } = await loadReal('');

    await expect(auth.api.getSession({ headers: new Headers() })).rejects.toThrow(/DATABASE_URL/);
  });

  /**
   * 설정은 환경변수만 보므로 인스턴스가 필요 없다. 세션 쿠키 이름은 네이티브 셸이 토큰을
   * 쿠키로 되돌릴 때 쓰는데, 그 자리가 DB 주소를 요구하면 안 된다.
   */
  it('세션 쿠키 이름은 DB 주소 없이도 읽힌다', async () => {
    const { sessionCookie } = await loadReal('');

    expect(sessionCookie.name).toMatch(/session/i);
  });
});
