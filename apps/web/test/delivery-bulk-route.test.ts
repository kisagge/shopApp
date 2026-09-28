import { describe, it, expect, vi, beforeEach } from 'vitest';
import { csvDocument, type Actor } from '@shop/core';

/**
 * 배송완료 일괄 처리.
 *
 * **송장은 한 번에 올리는데 도착 처리는 주문마다 눌러야 했다.** 500건을 올려 놓고 500번을 누르는 셈이라
 * 주문이 조금만 늘어도 실제로는 안 눌린다. 그런데 배송완료일부터 시계가 돈다 — 반품·교환 기한도, 자동
 * 구매확정도, 후기를 쓸 수 있는 때도. 안 눌리면 손님은 반품 신청조차 못 하고 적립금은 묶인 채 남는다.
 *
 * **한 건 상태 변경과 같은 함수를 줄마다 부른다** — 가맹점 범위·전이 규칙·손님 알림을 일괄 창구가 따로
 * 들고 있으면 반드시 갈린다.
 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getActor = session.getActor;

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const transitionOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/transition-order', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/admin/transition-order')>();
  return { ...actual, transitionOrder };
});

const { TransitionError } = await import('~/lib/admin/transition-order');
const { POST } = await import('~/app/api/admin/orders/deliveries/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/orders/deliveries', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const upload = (orderNos: string[]) =>
  post({ csv: csvDocument(['주문번호', '상품'], orderNos.map((o) => [o, '울 코트'])) });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
  transitionOrder.mockResolvedValue({ orderNo: 'x', orderStatus: 'DELIVERED', itemsMoved: 1, waitingForOthers: false });
});

describe('문지기', () => {
  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await upload(['20260915-0000001'])).status).toBe(401);
  });

  it('배송 권한이 없으면 403 — 본문을 보기 전에 막는다', async () => {
    getActor.mockResolvedValue(customer);

    const res = await upload(['20260915-0000001']);

    expect(res.status).toBe(403);
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it('요청 제한에 걸리면 그대로 돌려준다', async () => {
    enforceRateLimit.mockResolvedValue(new Response('too many', { status: 429 }));

    expect((await upload(['20260915-0000001'])).status).toBe(429);
  });
});

describe('옮기기', () => {
  it('줄마다 한 건 상태 변경을 부른다', async () => {
    const res = await upload(['20260915-0000001', '20260915-0000002']);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ delivered: 2, failures: [] });
    expect(transitionOrder.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['20260915-0000001', 'DELIVERED'],
      ['20260915-0000002', 'DELIVERED'],
    ]);
  });

  /**
   * 500줄 중 하나가 이미 취소된 주문이라고 499건의 도착 처리를 막으면, 운영자는 그 한 줄을 찾느라
   * 손님들의 반품 기한을 하루 늦춘다.
   */
  it('하나가 실패해도 나머지는 옮기고, 무엇이 왜 안 됐는지 줄과 함께 준다', async () => {
    transitionOrder.mockImplementation((orderNo: string) => {
      if (orderNo === '20260915-0000002') {
        throw new TransitionError('INVALID_TRANSITION', '취소된 주문입니다.', 409);
      }
      return Promise.resolve({ orderNo, orderStatus: 'DELIVERED', itemsMoved: 1, waitingForOthers: false });
    });

    const body = (await (await upload(['20260915-0000001', '20260915-0000002', '20260915-0000003'])).json()) as {
      delivered: number;
      failures: { orderNo: string; lines: number[]; message: string }[];
    };

    expect(body.delivered).toBe(2);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0]).toMatchObject({ orderNo: '20260915-0000002', lines: [3] });
    expect(body.failures[0]!.message).toContain('취소된 주문');
  });

  it('모르는 고장은 삼키지 않는다 — 500 으로 터뜨려 오류 수집에 남긴다', async () => {
    transitionOrder.mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(upload(['20260915-0000001'])).rejects.toThrow('DB 가 안 열린다');
  });

  it('같은 주문이 여러 줄에 나와도 한 번만 옮긴다', async () => {
    const body = (await (await upload(['20260915-0000001', '20260915-0000001'])).json()) as {
      delivered: number; merged: number;
    };

    expect(transitionOrder).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ delivered: 1, merged: 1 });
  });

  it('머리칸이 없으면 무엇을 올려야 하는지 말한다', async () => {
    const res = await post({ csv: csvDocument(['이름'], [['울 코트']]) });

    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('주문번호');
  });

  /**
   * **감사 로그는 한 줄이다.** 500건이면 500줄이 쌓여 그날의 다른 기록이 통째로 묻힌다 — 어느 주문이
   * 옮겨졌는지는 주문마다 남는 상태 기록이 갖고 있다.
   */
  it('감사 로그를 한 번만 남긴다', async () => {
    await upload(['20260915-0000001', '20260915-0000002']);

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      action: 'order.status.delivered.bulk',
      targetId: '2건',
    });
  });

  it('아무것도 안 옮겼으면 기록하지 않는다', async () => {
    transitionOrder.mockRejectedValue(new TransitionError('INVALID_TRANSITION', '안 됩니다.', 409));

    await upload(['20260915-0000001']);

    expect(recordAudit).not.toHaveBeenCalled();
  });
});
