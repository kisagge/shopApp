import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const {
  memoryRateLimiter, getRateLimiter, setRateLimiterForTest,
  requesterKey, enforceRateLimit,
} = await import('~/lib/rate-limit');

const req = (headers: Record<string, string> = {}) =>
  new Request('https://plain.test/api/events', { method: 'POST', headers });

beforeEach(() => setRateLimiterForTest(null));
afterEach(() => setRateLimiterForTest(null));

describe('메모리 계수기', () => {
  it('한도까지 통과하고 그 다음을 막는다', async () => {
    const limiter = memoryRateLimiter();
    const policy = { limit: 2, windowMs: 60_000 };

    expect((await limiter.take('k', policy)).allowed).toBe(true);
    expect((await limiter.take('k', policy)).allowed).toBe(true);
    const third = await limiter.take('k', policy);

    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('열쇠가 다르면 서로 영향이 없다', async () => {
    const limiter = memoryRateLimiter();
    const policy = { limit: 1, windowMs: 60_000 };

    await limiter.take('a', policy);
    expect((await limiter.take('b', policy)).allowed).toBe(true);
  });

  it('창이 지나면 다시 열린다', async () => {
    vi.useFakeTimers();
    const limiter = memoryRateLimiter();
    const policy = { limit: 1, windowMs: 1_000 };

    await limiter.take('k', policy);
    expect((await limiter.take('k', policy)).allowed).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect((await limiter.take('k', policy)).allowed).toBe(true);
    vi.useRealTimers();
  });

  it('같은 계수기를 계속 쓴다 — 매번 새로 만들면 세는 의미가 없다', () => {
    expect(getRateLimiter()).toBe(getRateLimiter());
  });
});

describe('누구의 요청인가', () => {
  it('로그인했으면 사용자 id 로 센다', () => {
    // IP 로만 세면 같은 사무실의 한 사람이 남의 몫까지 써 버린다
    const key = requesterKey('events', req({ 'x-forwarded-for': '1.2.3.4' }), 'u-1');
    expect(key).toBe('events:u:u-1');
  });

  it('비로그인은 IP 를 해시해서 센다 — 원본을 들고 있을 이유가 없다', () => {
    const key = requesterKey('events', req({ 'x-forwarded-for': '1.2.3.4' }), null);
    expect(key).toMatch(/^events:ip:[0-9a-f]{32}$/);
    expect(key).not.toContain('1.2.3.4');
  });

  it('프록시가 여러 개면 맨 앞을 쓴다', () => {
    const a = requesterKey('events', req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), null);
    const b = requesterKey('events', req({ 'x-forwarded-for': '1.2.3.4' }), null);
    expect(a).toBe(b);
  });

  it('IP 도 없으면 한 덩어리로 묶는다 — 셀 수 없는 요청을 무제한으로 두지 않는다', () => {
    expect(requesterKey('events', req(), null)).toBe('events:ip:unknown');
  });

  it('창구가 다르면 서로의 한도를 먹지 않는다', () => {
    expect(requesterKey('events', req(), 'u-1')).not.toBe(requesterKey('coupon', req(), 'u-1'));
  });
});

describe('막을 때의 응답', () => {
  it('통과하면 null 이다 — 부르는 쪽이 그대로 진행한다', async () => {
    expect(await enforceRateLimit('review', req(), 'u-1')).toBeNull();
  });

  it('막히면 429 와 안내 문구를 준다', async () => {
    // 리뷰 한도는 분당 5회
    for (let i = 0; i < 5; i += 1) await enforceRateLimit('review', req(), 'u-1');
    const res = await enforceRateLimit('review', req(), 'u-1');

    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const body = (await res!.json()) as { code: string; message: string };
    expect(body.code).toBe('RATE_LIMITED');
    expect(body.message).toContain('잠시 후');
  });

  it('retry-after 헤더를 붙인다 — 클라이언트가 언제 다시 올지 스스로 정한다', async () => {
    for (let i = 0; i < 5; i += 1) await enforceRateLimit('review', req(), 'u-2');
    const res = await enforceRateLimit('review', req(), 'u-2');

    expect(Number(res!.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('다른 사용자는 막히지 않는다', async () => {
    for (let i = 0; i < 6; i += 1) await enforceRateLimit('review', req(), 'u-3');
    expect(await enforceRateLimit('review', req(), 'u-4')).toBeNull();
  });
});
