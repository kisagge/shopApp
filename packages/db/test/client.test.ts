import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * 프리즈마 클라이언트를 **언제** 만드는가.
 *
 * **이 조각에는 검사가 하나도 없었다** — 커버리지를 켜서 찾았다. 그런데 이 모듈의 게으름은
 * 저장소 여러 곳이 근거로 삼고 있다: `packages/auth/src/index.ts` 가 "같은 문제를 같은
 * 방법으로 이미 풀어 두었다" 며 이쪽 주석을 가리키고, 거기서 **globalThis 에 담지 않는
 * 까닭**까지 이쪽과 견주어 적는다.
 *
 * 지키는 것은 둘이다.
 *
 *   1. **import 만으로는 아무것도 만들지 않는다.** ESM 은 import 를 본문보다 먼저
 *      평가하므로, 최상단에서 만들면 dotenv 가 `.env` 를 읽기도 전에 주소를 찾는다.
 *      그리고 CI·Vercel 빌드는 DB 없이 도는데, import 가 던지면 **DB 를 전혀 건드리지
 *      않는 페이지의 빌드까지 같이 죽는다.**
 *   2. **처음 쓸 때는 그대로 던진다.** 가드를 없앤 것이 아니다.
 */

const PrismaClient = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('../src/generated/client', () => ({ PrismaClient }));
const PrismaPg = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg }));

const LOCAL = 'postgresql://dummy:dummy@localhost:5432/unit_only';

type Cache = { __shopPrisma?: unknown };
const cache = globalThis as unknown as Cache;

/** 모듈을 새로 읽는다 — 클라이언트를 언제 만드는지가 쟁점이라 사본이 남으면 못 잰다 */
async function load() {
  vi.resetModules();
  delete cache.__shopPrisma;
  return import('../src/client');
}

const saved = process.env['DATABASE_URL'];

beforeEach(() => {
  vi.clearAllMocks();
  // `new PrismaClient(...)` 로 부르는 자리라 **보통 함수**여야 한다 — 화살표는 new 가 안 된다
  PrismaClient.mockImplementation(function () {
    return { order: { count: () => 0 }, $connect: () => undefined };
  });
});

afterEach(() => {
  if (saved === undefined) delete process.env['DATABASE_URL'];
  else process.env['DATABASE_URL'] = saved;
  delete cache.__shopPrisma;
});

describe('언제 만드는가', () => {
  it('import 만으로는 만들지 않는다 — 주소가 없어도 던지지 않는다', async () => {
    delete process.env['DATABASE_URL'];

    await expect(load()).resolves.toBeTruthy();
    expect(PrismaClient).not.toHaveBeenCalled();
  });

  it('처음 쓸 때 만든다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    const { prisma } = await load();
    expect(PrismaClient).not.toHaveBeenCalled();

    void prisma.order;

    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });

  /** 가드를 없앤 것이 아니다 — 쓰려는 순간에는 무엇이 없는지 말한다 */
  it('주소가 없는데 쓰려 하면 그때 던진다', async () => {
    delete process.env['DATABASE_URL'];
    const { prisma } = await load();

    expect(() => prisma.order).toThrow('DATABASE_URL');
  });

  it('여러 번 써도 한 번만 만든다 — 커넥션이 쌓인다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    const { prisma } = await load();

    void prisma.order;
    void prisma.user;
    void prisma.order;

    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});

/**
 * **globalThis 에 담는다 — 여기서는 그게 맞다.**
 *
 * 개발 중 HMR 이 돌 때마다 모듈이 새로 평가되는데, 모듈과 수명을 같이 하면 그때마다
 * 클라이언트가 하나씩 더 생겨 **커넥션이 쌓인다.**
 *
 * `packages/auth` 는 **반대로** 모듈 범위에 담는다. 그쪽 설정은 환경변수를 읽어 만들어져,
 * 환경을 바꿔 다시 불러 보는 검사에서 전역 사본이 살아남으면 낡은 설정을 돌려준다(실제로
 * base-url 검사 다섯이 그렇게 깨졌다). 둘의 선택이 다른 것은 **까닭이 다르기 때문**이고,
 * 양쪽을 각자 못 박아 두면 한쪽을 베껴 고치는 일이 막힌다.
 */
describe('어디에 담는가', () => {
  it('전역에 담아 HMR 을 넘어 쓴다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    const { prisma } = await load();

    void prisma.order;

    expect(cache.__shopPrisma).toBeTruthy();
  });

  it('전역에 이미 있으면 새로 만들지 않는다 — 모듈을 다시 읽어도 그렇다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    const first = await load();
    void first.prisma.order;
    expect(PrismaClient).toHaveBeenCalledTimes(1);

    // HMR 처럼 모듈만 새로 읽는다(전역은 그대로 둔다)
    vi.resetModules();
    const again = await import('../src/client');
    void again.prisma.order;

    expect(PrismaClient).toHaveBeenCalledTimes(1);
  });
});

describe('무엇을 넘기는가', () => {
  it('어댑터에 주소를 넘긴다 — 풀러를 거친 주소여야 한다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    const { prisma } = await load();

    void prisma.order;

    expect(PrismaPg).toHaveBeenCalledWith({ connectionString: LOCAL });
    expect(PrismaClient.mock.calls[0]![0]).toMatchObject({ adapter: expect.anything() });
  });

  /**
   * **개발에서만 경고를 본다.** 운영에서 `warn` 을 켜면 느린 조회 경고가 로그를 덮어
   * 정작 봐야 할 오류가 묻힌다. 반대로 개발에서 끄면 그 경고를 볼 자리가 없다.
   */
  it.each([
    ['development', ['warn', 'error']],
    ['production', ['error']],
    ['test', ['error']],
  ])('NODE_ENV 가 %s 이면 로그는 %s', async (env, expected) => {
    process.env['DATABASE_URL'] = LOCAL;
    vi.stubEnv('NODE_ENV', env);
    const { prisma } = await load();

    void prisma.order;

    expect(PrismaClient.mock.calls[0]![0].log).toEqual(expected);
    vi.unstubAllEnvs();
  });

  /**
   * **함수는 묶어서 돌려준다.** Proxy 가 그냥 넘기면 `this` 가 Proxy 가 되어, 프리즈마가
   * 내부 상태를 찾지 못한다 — `const { count } = prisma.order` 처럼 꺼내 쓰는 자리가 있다.
   */
  it('함수를 꺼내 따로 불러도 돈다', async () => {
    process.env['DATABASE_URL'] = LOCAL;
    // `this` 를 담지 않고 **속성만 읽는다** — 묶였는지만 알면 되고, 담으면 lint 가 막는다
    let seen: string | undefined;
    PrismaClient.mockImplementation(function () {
      return {
        mark: 'real',
        $connect(this: { mark?: string } | undefined) { seen = this?.mark; },
      };
    });
    const { prisma } = await load();

    const connect = prisma.$connect;
    void connect();

    expect(seen).toBe('real');
  });
});
