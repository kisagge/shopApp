import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB 싱크는 건드리지 않는다. 이 테스트가 검증하는 것은 라우트의 판단이지 적재가 아니다.
const recordEvents = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/analytics/server')>();
  return { ...actual, recordEvents };
});

// 세션도 갈아 끼운다. 라우트가 세션을 어떻게 쓰는지가 이 테스트의 관심사다.
const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve(null as unknown)));
vi.mock('@shop/auth/session', () => ({ getSessionUser }));

// 동의는 세션이 아니라 DB 에서 읽는다
const findUniqueUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve({ analyticsConsent: null })));
vi.mock('@shop/db', () => ({ prisma: { user: { findUnique: findUniqueUser } } }));

const { POST } = await import('~/app/api/events/route');

const envelope = {
  occurredAt: '2026-08-31T05:00:00.000Z',
  sessionId: 'sess_abcdefgh',
  anonymousId: 'anon_abcdefgh',
  path: '/product/oversized-wool-coat',
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://localhost/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const session = (over: Record<string, unknown> = {}) => ({
  id: 'u-1', email: 'a@b.test', name: 'n', role: 'CUSTOMER', merchantId: null, ...over,
});

beforeEach(() => {
  recordEvents.mockClear();
  getSessionUser.mockResolvedValue(null);
  findUniqueUser.mockClear().mockResolvedValue({ analyticsConsent: null });
});

describe('POST /api/events — 정상 수집', () => {
  it('유효한 배치를 받아 202 로 답한다', async () => {
    const res = await post({
      events: [
        { ...envelope, name: 'page_view' },
        { ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2, rejected: 0 });
    expect(recordEvents).toHaveBeenCalledOnce();
  });

  it('비로그인이면 userId 가 비어 있다', async () => {
    await post({ events: [{ ...envelope, name: 'page_view' }] });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].userId).toBeNull();
  });

  it('로그인 상태면 세션의 userId 를 붙인다', async () => {
    getSessionUser.mockResolvedValue(session({ id: 'u-real' }));
    await post({ events: [{ ...envelope, name: 'page_view' }] });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].userId).toBe('u-real');
  });

  it('요청 본문의 userId 는 무시한다 — 남의 계정으로 이벤트를 심을 수 없다', async () => {
    getSessionUser.mockResolvedValue(session({ id: 'u-real' }));
    await post({ events: [{ ...envelope, name: 'page_view', userId: 'victim-user-id' }] });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].userId).toBe('u-real');
  });

  it('아직 동의를 결정하지 않은(null) 사용자는 익명과 같게 취급한다', async () => {
    // null 을 거부로 뭉뚱그리면 로그인하는 순간 추적이 줄어든다
    getSessionUser.mockResolvedValue(session());
    findUniqueUser.mockResolvedValue({ analyticsConsent: null });
    const res = await post({ events: [{ ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' }] });
    expect(await res.json()).toEqual({ accepted: 1, rejected: 0 });
  });

  it('동의(GRANTED)한 사용자의 이벤트를 받는다', async () => {
    getSessionUser.mockResolvedValue(session());
    findUniqueUser.mockResolvedValue({ analyticsConsent: 'GRANTED' });
    const res = await post({ events: [{ ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' }] });
    expect(await res.json()).toEqual({ accepted: 1, rejected: 0 });
  });

  it('필수 이벤트만 있으면 동의를 조회하지도 않는다', async () => {
    getSessionUser.mockResolvedValue(session());
    await post({ events: [{ ...envelope, name: 'login' }] });
    expect(findUniqueUser).not.toHaveBeenCalled();
  });

  it('비로그인이면 동의를 조회하지 않는다', async () => {
    await post({ events: [{ ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' }] });
    expect(findUniqueUser).not.toHaveBeenCalled();
  });

  it('명시적으로 거부(DENIED)한 사용자의 분석 이벤트는 서버에서도 버린다 — 트래커 우회를 막는다', async () => {
    getSessionUser.mockResolvedValue(session());
    findUniqueUser.mockResolvedValue({ analyticsConsent: 'DENIED' });
    const res = await post({
      events: [
        { ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' },
        { ...envelope, name: 'login' },
      ],
    });
    expect(await res.json()).toEqual({ accepted: 1, rejected: 1 });
    const [events] = recordEvents.mock.calls[0]!;
    // 필수 이벤트(login)만 남는다
    expect(events.map((e: { name: string }) => e.name)).toEqual(['login']);
  });

  it('거부한 사용자가 분석 이벤트만 보내면 아무것도 적재하지 않는다', async () => {
    getSessionUser.mockResolvedValue(session());
    findUniqueUser.mockResolvedValue({ analyticsConsent: 'DENIED' });
    const res = await post({ events: [{ ...envelope, name: 'page_view' }] });
    expect(await res.json()).toEqual({ accepted: 0, rejected: 1 });
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('IP 를 원본으로 저장하지 않고 해시한다', async () => {
    await post({ events: [{ ...envelope, name: 'page_view' }] }, { 'x-forwarded-for': '203.0.113.7' });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(events[0])).not.toContain('203.0.113.7');
  });

  it('User-Agent 를 기기 종류로만 축약한다', async () => {
    await post(
      { events: [{ ...envelope, name: 'page_view' }] },
      { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' },
    );
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].deviceType).toBe('mobile');
    expect(JSON.stringify(events[0])).not.toContain('Mozilla');
  });

  it('집계 축을 컬럼으로 뽑아 준다', async () => {
    await post({
      events: [{ ...envelope, name: 'add_to_cart', productId: 'cmtgrsyc8000hx9oh6tozfnvx', variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 3 }],
    });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0]).toMatchObject({ productId: 'cmtgrsyc8000hx9oh6tozfnvx', variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 3 });
  });
});

describe('POST /api/events — 위조와 남용을 막는다', () => {
  it('purchase 를 브라우저가 보내면 거부한다 — 매출을 지어낼 수 없어야 한다', async () => {
    const res = await post({
      events: [{ ...envelope, name: 'purchase', orderId: '20260901-1234567', value: 99_999_999, itemCount: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SERVER_ONLY_EVENT');
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('refund 도 마찬가지로 거부한다', async () => {
    const res = await post({
      events: [{ ...envelope, name: 'refund', orderId: '20260901-1234567', value: 405_000 }],
    });
    expect(res.status).toBe(400);
  });

  it('정상 이벤트에 purchase 를 섞어 보내면 배치 전체를 거절한다', async () => {
    const res = await post({
      events: [
        { ...envelope, name: 'page_view' },
        { ...envelope, name: 'purchase', orderId: '20260901-1234567', value: 1, itemCount: 1 },
      ],
    });
    expect(res.status).toBe(400);
    // 일부만 조용히 받으면 클라이언트가 잘못 만들어진 걸 눈치채지 못한다
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('본문이 너무 크면 413 이다', async () => {
    const huge = JSON.stringify({ events: [{ ...envelope, name: 'page_view', pad: 'x'.repeat(70_000) }] });
    const res = await post(huge);
    expect(res.status).toBe(413);
  });

  it('배치 개수 상한을 넘기면 400 이다', async () => {
    const events = Array.from({ length: 21 }, () => ({ ...envelope, name: 'page_view' }));
    const res = await post({ events });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });

  it('JSON 이 아니면 400 이다', async () => {
    const res = await post('이건 JSON이 아니다');
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('INVALID_JSON');
  });

  it('경로에 외부 URL 을 넣으면 거부한다', async () => {
    const res = await post({
      events: [{ ...envelope, path: 'https://evil.test/steal', name: 'page_view' }],
    });
    expect(res.status).toBe(400);
  });

  it('적재가 실패해도 사용자에게 에러를 던지지 않는다 — 분석이 화면을 깨면 안 된다', async () => {
    recordEvents.mockRejectedValueOnce(new Error('DB 다운'));
    const res = await post({ events: [{ ...envelope, name: 'page_view' }] });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 0, rejected: 1 });
  });
});
