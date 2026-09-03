import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), findUniqueOrThrow: vi.fn<(...a: any[]) => any>() },
  shipment: { upsert: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const transitionOrder = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
class FakeTransitionError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
  }
}
vi.mock('~/lib/admin/transition-order', () => ({
  transitionOrder,
  TransitionError: FakeTransitionError,
}));

const { registerShipment, ShipmentError } = await import('~/lib/admin/manage-shipment');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const input = { carrier: 'CJ', trackingNumber: '1234-5678-9012' };

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue({ id: 'o-1', orderNo: '20260903-0000001' });
  db.shipment.upsert.mockResolvedValue({});
  transitionOrder.mockResolvedValue({
    orderNo: '20260903-0000001', orderStatus: 'SHIPPED', itemsMoved: 1, waitingForOthers: false,
  });
});

describe('권한', () => {
  it('고객은 송장을 넣을 수 없다', async () => {
    await expect(registerShipment('20260903-0000001', input, customer)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.shipment.upsert).not.toHaveBeenCalled();
  });

  it('가맹점은 자기 주문에만 넣는다 — 조회에 범위를 함께 건다', async () => {
    await registerShipment('20260903-0000001', input, merchant);

    expect(db.order.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      items: { some: { merchantId: 'm-a' } },
    });
  });

  it('남의 주문이면 404', async () => {
    db.order.findFirst.mockResolvedValue(null);

    await expect(registerShipment('20260903-9999999', input, merchant)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('입력 검증', () => {
  it('모르는 택배사는 거부한다', async () => {
    await expect(
      registerShipment('20260903-0000001', { ...input, carrier: 'DHL' }, admin),
    ).rejects.toBeInstanceOf(ShipmentError);
  });

  it('송장번호가 너무 짧으면 거부한다', async () => {
    await expect(
      registerShipment('20260903-0000001', { ...input, trackingNumber: '123' }, admin),
    ).rejects.toMatchObject({ code: 'INVALID_TRACKING_NUMBER' });
  });

  it('하이픈을 넣어도 받는다 — 사람은 종이에 적힌 대로 친다', async () => {
    await registerShipment('20260903-0000001', { carrier: 'CJ', trackingNumber: '1234-5678-9012' }, admin);

    // 저장은 숫자만. 조회 링크를 만들려면 한 모양이어야 한다.
    expect(db.shipment.upsert.mock.calls[0]?.[0].create).toMatchObject({
      trackingNumber: '123456789012',
    });
  });
});

describe('송장 등록과 배송중 전이는 한 동작이다', () => {
  it('송장을 저장한 뒤 SHIPPED 로 옮긴다', async () => {
    const result = await registerShipment('20260903-0000001', input, admin);

    expect(transitionOrder).toHaveBeenCalledWith(
      '20260903-0000001', 'SHIPPED', admin, expect.stringContaining('CJ대한통운'),
    );
    expect(result.orderStatus).toBe('SHIPPED');
  });

  it('다른 가맹점 상품이 남으면 주문은 아직 안 움직인다', async () => {
    transitionOrder.mockResolvedValue({
      orderNo: '20260903-0000001', orderStatus: 'PREPARING', itemsMoved: 1, waitingForOthers: true,
    });

    const result = await registerShipment('20260903-0000001', input, admin);

    expect(result.waitingForOthers).toBe(true);
  });
});

describe('송장 수정', () => {
  it('이미 배송중이면 전이는 실패해도 송장은 바뀐다', async () => {
    // 오타를 고치러 온 사람을 막으면 안 된다
    transitionOrder.mockRejectedValue(
      new FakeTransitionError('INVALID_TRANSITION', '배송중 상태의 상품은...'),
    );
    db.order.findUniqueOrThrow.mockResolvedValue({ status: 'SHIPPED' });

    const result = await registerShipment(
      '20260903-0000001',
      { carrier: 'HANJIN', trackingNumber: '9876543210' },
      admin,
    );

    expect(db.shipment.upsert).toHaveBeenCalled();
    expect(result.trackingNumber).toBe('9876543210');
    expect(result.orderStatus).toBe('SHIPPED');
  });

  it('다시 등록하면 덮어쓴다 — 못 고치면 남의 택배를 조회하게 된다', async () => {
    await registerShipment('20260903-0000001', input, admin);

    const call = db.shipment.upsert.mock.calls[0]?.[0];
    expect(call.where).toEqual({ orderId: 'o-1' });
    expect(call.update).toMatchObject({ carrier: 'CJ', trackingNumber: '123456789012' });
  });

  it('전이가 다른 이유로 실패하면 그대로 던진다', async () => {
    transitionOrder.mockRejectedValue(new FakeTransitionError('FORBIDDEN', '권한 없음', 403));

    await expect(registerShipment('20260903-0000001', input, admin)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
