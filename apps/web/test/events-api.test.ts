import { describe, it, expect, vi, beforeEach } from 'vitest';

// DB 싱크는 건드리지 않는다. 이 테스트가 검증하는 것은 라우트의 판단이지 적재가 아니다.
const recordEvents = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/analytics/server')>();
  return { ...actual, recordEvents };
});

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

beforeEach(() => recordEvents.mockClear());

describe('POST /api/events — 정상 수집', () => {
  it('유효한 배치를 받아 202 로 답한다', async () => {
    const res = await post({
      events: [
        { ...envelope, name: 'page_view' },
        { ...envelope, name: 'view_item', productId: 'p-1' },
      ],
    });
    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ accepted: 2, rejected: 0 });
    expect(recordEvents).toHaveBeenCalledOnce();
  });

  it('userId 는 요청 본문이 아니라 서버가 정한다 — 남의 계정으로 이벤트를 심을 수 없다', async () => {
    await post({ events: [{ ...envelope, name: 'page_view', userId: 'victim-user-id' }] });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0].userId).toBeNull();
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
      events: [{ ...envelope, name: 'add_to_cart', productId: 'p-1', variantId: 'v-1', quantity: 3 }],
    });
    const [events] = recordEvents.mock.calls[0]!;
    expect(events[0]).toMatchObject({ productId: 'p-1', variantId: 'v-1', quantity: 3 });
  });
});

describe('POST /api/events — 위조와 남용을 막는다', () => {
  it('purchase 를 브라우저가 보내면 거부한다 — 매출을 지어낼 수 없어야 한다', async () => {
    const res = await post({
      events: [{ ...envelope, name: 'purchase', orderId: 'o-1', value: 99_999_999, itemCount: 1 }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('SERVER_ONLY_EVENT');
    expect(recordEvents).not.toHaveBeenCalled();
  });

  it('refund 도 마찬가지로 거부한다', async () => {
    const res = await post({
      events: [{ ...envelope, name: 'refund', orderId: 'o-1', value: 405_000 }],
    });
    expect(res.status).toBe(400);
  });

  it('정상 이벤트에 purchase 를 섞어 보내면 배치 전체를 거절한다', async () => {
    const res = await post({
      events: [
        { ...envelope, name: 'page_view' },
        { ...envelope, name: 'purchase', orderId: 'o-1', value: 1, itemCount: 1 },
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
