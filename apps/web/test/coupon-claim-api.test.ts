import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setRateLimiterForTest, type RateLimiter } from '~/lib/rate-limit';

/**
 * 코드를 넣어 쿠폰을 받는 창구.
 *
 * 라우트가 스스로 하는 판단만 본다 — 누구인지, 얼마나 자주 부르는지, 잘못된
 * 본문을 어떻게 돌려주는지, 업무 오류를 어떤 상태로 내보내는지. 쿠폰을 실제로
 * 발급하는 규칙은 `manage-coupon` 의 몫이라 갈아 끼운다.
 */

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));

const claimCouponByCode = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-coupon', async (importOriginal) => {
  // CouponError 는 진짜를 쓴다 — 라우트가 instanceof 로 가른다
  const actual = await importOriginal<typeof import('~/lib/admin/manage-coupon')>();
  return { ...actual, claimCouponByCode };
});

const { POST } = await import('~/app/api/coupons/claim/route');
const { CouponError } = await import('~/lib/admin/manage-coupon');

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/coupons/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

/** 부른 열쇠를 들여다볼 수 있는 제한기 */
function spyLimiter(allowed: boolean): RateLimiter & { keys: string[] } {
  const keys: string[] = [];
  return {
    name: 'spy',
    keys,
    take: async (key) => {
      keys.push(key);
      return { allowed, remaining: allowed ? 9 : 0, retryAfterSeconds: allowed ? 0 : 42 };
    },
  };
}

let limiter: ReturnType<typeof spyLimiter>;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-1', email: 'a@b.test', role: 'CUSTOMER' });
  claimCouponByCode.mockResolvedValue({ couponId: 'c-1', name: '가을 쿠폰' });
  limiter = spyLimiter(true);
  setRateLimiterForTest(limiter);
});
afterEach(() => setRateLimiterForTest(null));

describe('로그인', () => {
  it('비로그인은 401 이고, 쿠폰을 건드리지 않는다', async () => {
    getSessionUser.mockResolvedValue(null);

    const res = await post({ code: 'AUTUMN' });

    expect(res.status).toBe(401);
    expect(claimCouponByCode).not.toHaveBeenCalled();
  });

  /**
   * 본문의 값이 아니라 **세션의 사용자**에게 발급해야 한다. 본문을 믿으면
   * 아무나 남의 계정으로 쿠폰을 받게 할 수 있다.
   */
  it('본문에 다른 사람 id 를 실어도 자기 것으로만 받는다', async () => {
    await post({ code: 'AUTUMN', userId: 'u-victim' });

    expect(claimCouponByCode).toHaveBeenCalledWith('AUTUMN', 'u-1');
  });
});

describe('요청 제한', () => {
  /**
   * 같은 사무실에서 여러 사람이 쓰면 IP 가 같다. IP 로 세면 한 사람이 남의
   * 몫까지 써 버린다 — 로그인이 필수인 창구라 사용자 id 로 셀 수 있다.
   */
  it('IP 가 아니라 사용자 id 로 센다', async () => {
    await post({ code: 'AUTUMN' }, { 'x-forwarded-for': '203.0.113.9' });

    expect(limiter.keys).toEqual(['coupon:u:u-1']);
  });

  it('걸리면 429 와 다시 시도할 시각을 준다', async () => {
    setRateLimiterForTest(spyLimiter(false));

    const res = await post({ code: 'AUTUMN' });

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('42');
    await expect(res.json()).resolves.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('막혔으면 쿠폰을 건드리지 않는다', async () => {
    setRateLimiterForTest(spyLimiter(false));

    await post({ code: 'AUTUMN' });

    expect(claimCouponByCode).not.toHaveBeenCalled();
  });

  /** 형식이 틀린 본문으로 무한히 두드릴 수 있으면 제한이 없는 것과 같다 */
  it('본문이 잘못돼도 한 번 센다 — 검사보다 먼저 건다', async () => {
    await post('{{{');

    expect(limiter.keys).toHaveLength(1);
  });
});

describe('본문 검사', () => {
  it.each([
    ['JSON 이 아님', '{{{'],
    ['빈 객체', {}],
    ['코드가 빈 문자열', { code: '' }],
    ['코드가 공백뿐', { code: '   ' }],
    ['코드가 문자열이 아님', { code: 12345 }],
  ])('%s 은 400 이다', async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(claimCouponByCode).not.toHaveBeenCalled();
  });

  /**
   * 계약의 문구는 사전 열쇠이고 번역은 응답을 만들 때 한다. 열쇠가 그대로
   * 나가면 사용자에게 `valid.couponCodeRequired` 가 보인다.
   */
  it('열쇠를 그대로 내보내지 않는다', async () => {
    const res = await post({ code: '' });
    const body = (await res.json()) as { message: string; fields: Record<string, string> };

    expect(body.message).not.toMatch(/^valid\./);
    expect(body.fields['code']).not.toMatch(/^valid\./);
  });

  /**
   * 길이 상한에도 열쇠가 붙어 있어야 한다. 붙어 있지 않으면 Zod 의 기본
   * 문구가 그대로 나가서 한국어 화면에 영어 문장이 뜬다.
   */
  it('너무 긴 코드에도 우리 말로 답한다', async () => {
    const res = await post({ code: 'A'.repeat(31) });
    const body = (await res.json()) as { message: string };

    expect(res.status).toBe(400);
    expect(body.message, 'Zod 기본 문구가 그대로 나가고 있다').not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe('업무 오류', () => {
  it.each([
    ['없는 코드', 'NOT_FOUND', 404],
    ['이미 받음', 'ALREADY_ISSUED', 409],
    ['수량 소진', 'EXHAUSTED', 409],
  ])('%s 은 그 상태로 나간다', async (_label, code, status) => {
    claimCouponByCode.mockRejectedValue(new CouponError(code, '사용할 수 없는 코드입니다.', status));

    const res = await post({ code: 'AUTUMN' });

    expect(res.status).toBe(status);
    await expect(res.json()).resolves.toMatchObject({ code });
  });

  /**
   * 뜻밖의 오류를 삼키면 "받았다" 는 응답이 나가고 쿠폰은 없다. 사용자는
   * 마이페이지를 보고 나서야 알게 된다.
   */
  it('뜻밖의 오류는 삼키지 않는다', async () => {
    claimCouponByCode.mockRejectedValue(new Error('DB 연결 끊김'));

    await expect(post({ code: 'AUTUMN' })).rejects.toThrow('DB 연결 끊김');
  });
});

describe('성공', () => {
  it('발급 결과를 그대로 돌려준다', async () => {
    const res = await post({ code: '  autumn  ' });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ couponId: 'c-1', name: '가을 쿠폰' });
  });

  /** 계약이 앞뒤 공백을 떼므로, 붙여 넣다 딸려온 공백 때문에 실패하지 않는다 */
  it('앞뒤 공백은 떼고 넘긴다', async () => {
    await post({ code: '  autumn  ' });

    expect(claimCouponByCode).toHaveBeenCalledWith('autumn', 'u-1');
  });
});
