import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  returnRequest: { create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { requestReturn, resolveReturn } = await import('~/lib/orders/return-request');

const user = { id: 'u-1' };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const DAY = 24 * 60 * 60 * 1000;
const delivered = new Date('2026-09-01T10:00:00+09:00');
const now = new Date(delivered.getTime() + 2 * DAY);

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260901-0000001', status: 'DELIVERED', deliveredAt: delivered, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('반송비는 서버가 사유에서 정한다', () => {
  it('단순 변심이면 고객 부담', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now);

    expect(r.shippingBorneBy).toBe('CUSTOMER');
    expect(db.returnRequest.create.mock.calls[0]?.[0].data).toMatchObject({
      shippingBorneBy: 'CUSTOMER',
    });
  });

  it('불량이면 판매자 부담', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now);

    expect(r.shippingBorneBy).toBe('SELLER');
  });

  it('요청에 부담 주체를 끼워 넣어도 무시한다', async () => {
    // 받아 쓰면 누구나 SELLER 를 보내 반송비를 넘길 수 있다
    await requestReturn(
      '20260901-0000001',
      { type: 'RETURN', reason: 'CHANGED_MIND', shippingBorneBy: 'SELLER' } as never,
      user,
      now,
    );

    expect(db.returnRequest.create.mock.calls[0]?.[0].data).toMatchObject({
      shippingBorneBy: 'CUSTOMER',
    });
  });
});

describe('신청 자격', () => {
  it('남의 주문에는 신청할 수 없다 — 조회에 userId 를 건다', async () => {
    await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now);

    expect(db.order.findFirst.mock.calls[0]?.[0].where).toMatchObject({ userId: 'u-1' });
  });

  it('없는 주문은 404', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(
      requestReturn('20260901-9999999', { type: 'RETURN', reason: 'DEFECT' }, user, now),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('변심 기한이 지나면 거절한다', async () => {
    const late = new Date(delivered.getTime() + 8 * DAY);

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, late),
    ).rejects.toMatchObject({ code: 'WINDOW_CLOSED' });
    expect(db.returnRequest.create).not.toHaveBeenCalled();
  });

  it('같은 시점이라도 하자는 아직 받는다', async () => {
    const late = new Date(delivered.getTime() + 8 * DAY);

    const r = await requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, late);

    expect(r.orderStatus).toBe('RETURN_REQUESTED');
  });

  /**
   * 확정은 "이대로 받겠다" 는 뜻이지 판매자 잘못까지 떠안겠다는 뜻이 아니다.
   * 예전에는 사유를 묻지도 않고 막고 "고객센터로 문의해 주세요" 를 내보냈는데,
   * 그 뒤가 코드에 없었다.
   */
  it('구매확정된 주문도 하자면 받는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));

    const r = await requestReturn(
      '20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now,
    );

    expect(r.orderStatus).toBe('RETURN_REQUESTED');
  });

  it('구매확정된 주문에 단순 변심은 여전히 막는다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'CONFIRMED' }));

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now),
    ).rejects.toMatchObject({ code: 'ALREADY_CONFIRMED' });
  });

  it('출고 전이면 취소로 안내한다', async () => {
    db.order.findFirst.mockResolvedValue(order({ status: 'PAID', deliveredAt: null }));

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'CHANGED_MIND' }, user, now),
    ).rejects.toMatchObject({ code: 'NOT_SHIPPED' });
  });

  it('그 사이 상태가 바뀌었으면 조건부 UPDATE 가 0건을 낸다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      requestReturn('20260901-0000001', { type: 'RETURN', reason: 'DEFECT' }, user, now),
    ).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });
});

describe('교환도 같은 창구로 받는다', () => {
  it('교환 신청은 반품과 같은 상태를 지난다', async () => {
    const r = await requestReturn('20260901-0000001', { type: 'EXCHANGE', reason: 'DEFECT' }, user, now);

    expect(r.type).toBe('EXCHANGE');
    expect(r.orderStatus).toBe('RETURN_REQUESTED');
    expect(db.orderStatusLog.create.mock.calls[0]?.[0].data.note).toContain('교환');
  });
});

describe('운영진 처리', () => {
  const requested = {
    id: 'o-1', orderNo: '20260901-0000001', status: 'RETURN_REQUESTED',
    returnRequests: [{ id: 'r-1', status: 'REQUESTED' }],
  };

  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(requested);
  });

  it('가맹점은 반품을 처리할 수 없다 — 환불로 이어지는 판단이다', async () => {
    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, merchant),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('승인하면 주문 상태를 건드리지 않는다 — 환불은 별도 동작이다', async () => {
    const r = await resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin);

    expect(r.status).toBe('APPROVED');
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('반려하면 배송중으로 되돌린다 — 안 되돌리면 주문이 반품접수에 갇힌다', async () => {
    const r = await resolveReturn(
      '20260901-0000001',
      { action: 'REJECT', rejectReason: '사용 흔적이 있습니다' },
      admin,
    );

    expect(r.orderStatus).toBe('SHIPPED');
    expect(db.order.updateMany).toHaveBeenCalled();
  });

  it('반려 사유를 신청 행에 남긴다 — 고객에게 그대로 보인다', async () => {
    await resolveReturn(
      '20260901-0000001',
      { action: 'REJECT', rejectReason: '사용 흔적이 있습니다' },
      admin,
    );

    expect(db.returnRequest.update.mock.calls[0]?.[0].data).toMatchObject({
      status: 'REJECTED',
      rejectReason: '사용 흔적이 있습니다',
      resolvedBy: 'u-admin',
    });
  });

  it('이미 처리된 신청은 다시 처리하지 않는다', async () => {
    db.order.findFirst.mockResolvedValue({
      ...requested,
      returnRequests: [{ id: 'r-1', status: 'APPROVED' }],
    });

    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin),
    ).rejects.toMatchObject({ code: 'ALREADY_RESOLVED' });
  });

  it('신청이 없으면 404', async () => {
    db.order.findFirst.mockResolvedValue({ ...requested, returnRequests: [] });

    await expect(
      resolveReturn('20260901-0000001', { action: 'APPROVE' }, admin),
    ).rejects.toMatchObject({ code: 'NO_REQUEST' });
  });
});
