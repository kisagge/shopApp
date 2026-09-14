import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), findUniqueOrThrow: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
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

const { registerShipment, findUnchangedShipments, ShipmentError } = await import('~/lib/admin/manage-shipment');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const input = { carrier: 'CJ', trackingNumber: '1234-5678-9012' };

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue({
    id: 'o-1',
    orderNo: '20260903-0000001',
    status: 'PREPARING',
  });
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

/**
 * 어떤 주문에 송장을 붙일 수 있는가.
 *
 * **예전에는 상태를 안 보고 먼저 저장했다.** 송장을 쓰고 나서 전이를 시도하고,
 * 전이가 실패하면 그 오류를 삼켰다. 삼키는 것 자체는 뜻이 있었다 — 이미 배송
 * 중인 주문의 오타를 고치러 온 사람을 막으면 안 된다. 그런데 그 예외가 **모든
 * 실패한 전이**에 걸려서 취소·환불된 주문에도 송장이 붙었고, 고객 화면은
 * 송장이 있으면 운송 조회를 그리므로 **취소한 주문에 배송 조회가 떴다.**
 */
describe('보낼 수 없는 주문에는 붙지 않는다', () => {
  const at = (status: string) => {
    db.order.findFirst.mockResolvedValue({ id: 'o-1', orderNo: '20260903-0000001', status });
    return registerShipment('20260903-0000001', input, admin);
  };

  it.each(['CANCELLED', 'REFUNDED', 'RETURNED'] as const)(
    '%s 주문은 거절한다 — 보낼 물건이 없다',
    async (status) => {
      await expect(at(status)).rejects.toMatchObject({ code: 'NOT_SHIPPABLE' });
      expect(db.shipment.upsert, '거절했는데 송장이 쓰였다').not.toHaveBeenCalled();
    },
  );

  /**
   * 결제완료에서 배송중으로 가는 길은 없다 — 배송준비를 거쳐야 한다. 예전에는
   * 여기서 송장만 쓰이고 상태는 그대로였다. 단추 이름이 거짓말을 한 셈이다.
   */
  it('결제완료 주문은 거절한다 — 배송준비를 먼저 거쳐야 한다', async () => {
    await expect(at('PAID')).rejects.toMatchObject({ code: 'NOT_SHIPPABLE' });
    expect(db.shipment.upsert).not.toHaveBeenCalled();
  });

  /**
   * 반품접수는 전이표에는 배송중으로 가는 길이 있다. 그 길은 **반품을 반려할
   * 때** 쓰는 것이지 송장 등록의 뒷문이 아니다.
   */
  it('반품접수 주문은 거절한다 — 반려는 반려의 길로 한다', async () => {
    await expect(at('RETURN_REQUESTED')).rejects.toMatchObject({ code: 'NOT_SHIPPABLE' });
    expect(db.shipment.upsert).not.toHaveBeenCalled();
  });

  it('배송준비 주문은 받는다', async () => {
    await expect(at('PREPARING')).resolves.toMatchObject({ orderStatus: 'SHIPPED' });
    expect(db.shipment.upsert).toHaveBeenCalledOnce();
  });

  /**
   * 이미 보낸 주문의 오타 고치기는 계속 된다. 이것을 막으면 고객이 남의
   * 택배를 조회하게 된다 — 삼킴을 둔 원래 이유다.
   */
  it('이미 배송중인 주문은 송장만 고칠 수 있다', async () => {
    transitionOrder.mockRejectedValueOnce(
      new FakeTransitionError('INVALID_TRANSITION', '갈 수 없는 상태'),
    );
    db.order.findUniqueOrThrow.mockResolvedValue({ status: 'SHIPPED' });
    await expect(at('SHIPPED')).resolves.toMatchObject({ orderStatus: 'SHIPPED' });
    expect(db.shipment.upsert).toHaveBeenCalledOnce();
  });

  /**
   * **고칠 때 보낸 날짜를 덮지 않는다.** 오타를 고치는 것이지 다시 보내는
   * 것이 아닌데, 예전에는 고칠 때마다 오늘로 덮여서 지난주에 보낸 주문의
   * 발송일이 오늘이 됐다.
   */
  it('고칠 때 보낸 날짜를 건드리지 않는다', async () => {
    await at('PREPARING');
    const call = db.shipment.upsert.mock.calls[0]![0] as {
      update: Record<string, unknown>;
      create: Record<string, unknown>;
    };
    expect(call.update).not.toHaveProperty('shippedAt');
    // 처음 붙일 때는 당연히 찍는다
    expect(call.create).toHaveProperty('shippedAt');
  });
});


describe('이미 같은 송장인 주문 (일괄 올리기)', () => {
  const entries = [
    { orderNo: 'A', carrier: 'CJ', trackingNumber: '1234-5678-9012' },
    { orderNo: 'B', carrier: 'CJ', trackingNumber: '999999999999' },
    { orderNo: 'C', carrier: 'HANJIN', trackingNumber: '123456789012' },
    { orderNo: 'D', carrier: 'CJ', trackingNumber: '123456789012' },
  ];

  beforeEach(() => {
    db.order.findMany.mockResolvedValue([
      { orderNo: 'A', shipment: { carrier: 'CJ', trackingNumber: '123456789012' } },
      { orderNo: 'B', shipment: { carrier: 'CJ', trackingNumber: '123456789012' } },
      { orderNo: 'C', shipment: { carrier: 'CJ', trackingNumber: '123456789012' } },
      { orderNo: 'D', shipment: null },
    ]);
  });

  it('택배사와 (하이픈을 뗀) 송장번호가 모두 같아야 같다', async () => {
    expect([...(await findUnchangedShipments(entries, admin))]).toEqual(['A']);
  });

  it('가맹점은 자기 주문 안에서만 비교한다', async () => {
    // 범위를 안 걸면 남의 주문번호를 넣어 보는 것으로 송장이 같은지가 새어 나간다
    await findUnchangedShipments(entries, merchant);
    expect(db.order.findMany.mock.calls[0]![0].where.items).toEqual({ some: { merchantId: 'm-a' } });
  });

  it('소속 없는 가맹점 계정은 아무것도 비교하지 않는다', async () => {
    const orphan: Actor = { id: 'u-x', role: 'MERCHANT', merchantId: null };
    expect((await findUnchangedShipments(entries, orphan)).size).toBe(0);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
