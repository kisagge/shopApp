import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 선택 동의를 켜고 끄는 창구 — 마케팅 정보 수신과 이용 기록 수집.
 *
 * **이용 기록 동의는 계정에 남아야 한다.** 수집 창구는 계정의 거부(DENIED)를 존중하는데, 그 값을 만드는 곳이
 * 탈퇴 처리뿐이라 화면의 토글은 이 브라우저에만 적고 있었다 — 기기를 바꾸면 껐던 추적이 조용히 되살아났다.
 *
 * **null 과 DENIED 는 다르다.** null 은 "아직 고른 적 없음" 이라 기본값을 따르고, DENIED 는 사람이 직접
 * 거부한 것이라 반드시 존중한다. 여기서 적는 것은 사람이 고른 값이므로 둘 중 하나다.
 */

const db = vi.hoisted(() => ({ user: { update: vi.fn<(...a: any[]) => any>() } }));
vi.mock('@shop/db', () => ({ prisma: db }));
const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getSessionUser = session.getSessionUser;
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { PATCH } = await import('~/app/api/account/consent/route');

const send = (body: unknown) =>
  PATCH(new Request('http://localhost/api/account/consent', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

const written = () => db.user.update.mock.calls[0]![0].data as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-1', email: 'a@b.test', name: '손님', role: 'CUSTOMER', merchantId: null });
  enforceRateLimit.mockResolvedValue(null);
  db.user.update.mockResolvedValue({ marketingAgreedAt: null, analyticsConsent: 'DENIED' });
});

describe('이용 기록 수집', () => {
  it('끄면 계정에 거부로 적는다 — 그 값을 수집 창구가 존중한다', async () => {
    const response = await send({ analytics: false });

    expect(response.status).toBe(200);
    expect(written()).toEqual({ analyticsConsent: 'DENIED' });
    expect(await response.json()).toMatchObject({ analytics: false });
  });

  it('켜면 허용으로 적는다 — 고른 적 없음(null)과 구분된다', async () => {
    db.user.update.mockResolvedValue({ marketingAgreedAt: null, analyticsConsent: 'GRANTED' });

    await send({ analytics: true });

    expect(written()).toEqual({ analyticsConsent: 'GRANTED' });
  });

  it('보내지 않은 동의는 건드리지 않는다 — 마케팅만 바꾸러 왔는데 이용 기록이 함께 덮이면 안 된다', async () => {
    await send({ marketing: true });

    expect(written()).not.toHaveProperty('analyticsConsent');
    expect(written()).toHaveProperty('marketingAgreedAt');
  });

  it('둘을 함께 보내도 된다', async () => {
    await send({ marketing: false, analytics: false });

    expect(written()).toEqual({ marketingAgreedAt: null, analyticsConsent: 'DENIED' });
  });
});

describe('막는 것', () => {
  it('로그인해야 한다 — 계정의 값이다', async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await send({ analytics: false })).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('아무것도 안 보내면 막는다 — 빈 요청으로 저장을 부르지 않는다', async () => {
    expect((await send({})).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('요청이 잦으면 막는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    expect((await send({ analytics: false })).status).toBe(429);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
