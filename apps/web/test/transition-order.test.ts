import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const tx = vi.hoisted(() => ({
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findFirst: vi.fn<(...a: any[]) => any>(), create: vi.fn<(...a: any[]) => any>() },
  user: { update: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({ order: { findFirst: vi.fn<(...a: any[]) => any>() }, $transaction: vi.fn<(...a: any[]) => any>() }));
vi.mock('@shop/db', () => ({ prisma: db }));

const { transitionOrder, TransitionError } = await import('~/lib/admin/transition-order');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

/** 두 가맹점 상품이 섞인 주문 */
const mixedOrder = (status = 'PAID') => ({
  id: 'o-1', orderNo: '20260831-1234567', status,
  items: [
    { id: 'i-1', status, merchantId: 'm-a' },
    { id: 'i-2', status, merchantId: 'm-b' },
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(mixedOrder());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.orderItem.updateMany.mockResolvedValue({ count: 1 });
  // 조건부 UPDATE 가 성공한 경우가 기본. 0건은 그 사이 누가 먼저 처리했다는 뜻이다.
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.pointTransaction.findFirst.mockResolvedValue(null);
  tx.orderItem.findMany.mockResolvedValue([{ status: 'PREPARING' }, { status: 'PREPARING' }]);
});

describe('권한', () => {
  it('고객은 어드민 전이를 못 한다', async () => {
    await expect(
      transitionOrder('20260831-1234567', 'PREPARING', customer),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('가맹점은 출고 처리를 할 수 있다', async () => {
    await expect(
      transitionOrder('20260831-1234567', 'PREPARING', merchantA),
    ).resolves.toBeDefined();
  });

  it('반품완료는 order:refund 를 요구한다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('RETURN_REQUESTED'));
    await expect(
      transitionOrder('20260831-1234567', 'RETURNED', merchantA),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('돈을 되돌리는 동작은 여기로 오지 않는다', () => {
  /*
   * 환불만 막아 두고 취소는 열어 뒀다. 취소는 재고·포인트·쿠폰을 되돌리고
   * PG 취소까지 보내는 동작인데, 이 길로 오면 그중 아무것도 안 일어나고
   * 줄 상태만 취소로 바뀐다 — 재고가 영영 잠긴다.
   */
  it('취소는 거절하고 어디로 가야 하는지 말한다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    await expect(
      transitionOrder('20260831-1234567', 'CANCELLED', admin),
    ).rejects.toMatchObject({ code: 'USE_CANCEL', status: 400 });
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('환불도 마찬가지다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('CANCELLED'));
    await expect(
      transitionOrder('20260831-1234567', 'REFUNDED', admin),
    ).rejects.toMatchObject({ code: 'USE_REFUND', status: 400 });
  });

  /*
   * 반품접수에서 배송중으로 돌아가는 길은 반품을 **반려**할 때 쓰는 것이다.
   * 상태 단추로 지나가면 신청은 접수된 채 남고 주문만 되감긴다 — 그 뒤에
   * 승인해도 반품완료로 갈 길이 없어 신청이 영영 처리되지 않는다.
   */
  it('반품접수를 상태 단추로 되감을 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('RETURN_REQUESTED'));
    await expect(
      transitionOrder('20260831-1234567', 'SHIPPED', admin),
    ).rejects.toMatchObject({ code: 'USE_RETURN_RESOLVE', status: 400 });
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });
});

describe('가맹점 범위 — 한 주문에 여러 가맹점 상품이 섞인다', () => {
  it('가맹점은 자기 줄만 옮긴다', async () => {
    await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(tx.orderItem.updateMany.mock.calls[0]![0].where.id.in).toEqual(['i-1']);
  });

  it('운영진은 전체 줄을 옮긴다', async () => {
    await transitionOrder('20260831-1234567', 'PREPARING', admin);
    expect(tx.orderItem.updateMany.mock.calls[0]![0].where.id.in).toEqual(['i-1', 'i-2']);
  });

  it('조회 자체가 자기 상품이 든 주문으로 제한된다', async () => {
    await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(db.order.findFirst.mock.calls[0]![0].where).toMatchObject({
      items: { some: { merchantId: 'm-a' } },
    });
  });

  it('자기 상품이 없는 주문은 찾지 못한다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(
      transitionOrder('20260831-1234567', 'PREPARING', merchantB),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });
});

describe('주문 전체는 모든 줄이 도달해야 움직인다', () => {
  it('다른 가맹점 줄이 남으면 주문 상태를 바꾸지 않는다', async () => {
    // A 가 출고했지만 B 상품이 아직 PAID
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PAID' }, { status: 'PREPARING' }]);
    const r = await transitionOrder('20260831-1234567', 'PREPARING', merchantA);

    expect(r.waitingForOthers).toBe(true);
    expect(r.orderStatus).toBe('PAID');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('그래도 누가 무엇을 했는지는 이력에 남긴다', async () => {
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PAID' }, { status: 'PREPARING' }]);
    await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(tx.orderStatusLog.create.mock.calls[0]![0].data.note).toContain('대기 중');
    expect(tx.orderStatusLog.create.mock.calls[0]![0].data.actor).toBe('u-a');
  });

  it('모든 줄이 도달하면 주문도 옮기고 시각을 찍는다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PREPARING'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'SHIPPED' }, { status: 'SHIPPED' }]);
    const r = await transitionOrder('20260831-1234567', 'SHIPPED', admin);

    expect(r.waitingForOthers).toBe(false);
    expect(tx.order.updateMany.mock.calls[0]![0].data).toMatchObject({ status: 'SHIPPED' });
    expect(tx.order.updateMany.mock.calls[0]![0].data.shippedAt).toBeInstanceOf(Date);
  });
});

describe('상태머신이 막는 전이', () => {
  it('결제완료에서 바로 배송중으로 갈 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    await expect(
      transitionOrder('20260831-1234567', 'SHIPPED', admin),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('에러 메시지에 한글 상태명이 들어간다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    await expect(
      transitionOrder('20260831-1234567', 'SHIPPED', admin),
    ).rejects.toThrow(/결제완료.*배송중/);
  });

  it('구매확정에서 배송준비로 되돌릴 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('CONFIRMED'));
    await expect(
      transitionOrder('20260831-1234567', 'PREPARING', admin),
    ).rejects.toBeInstanceOf(TransitionError);
  });

  it('그 사이 다른 요청이 먼저 처리했으면 거절한다', async () => {
    tx.orderItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      transitionOrder('20260831-1234567', 'PREPARING', admin),
    ).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });
});

describe('주문 상태는 가장 뒤처진 줄을 따른다', () => {
  it('한 가맹점이 먼저 앞서가도 주문은 뒤처진 줄을 따라간다', async () => {
    // 실제로 겪은 버그: 무어가 배송중, 스튜디오눈이 배송준비인데
    // 주문은 결제완료에 머물렀다. "모든 줄이 목표와 같은가" 로 봤기 때문이다.
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'SHIPPED' }, { status: 'PREPARING' }]);

    const r = await transitionOrder('20260831-1234567', 'PREPARING', merchantB);

    expect(r.orderStatus).toBe('PREPARING');
    expect(tx.order.updateMany.mock.calls[0]![0].data.status).toBe('PREPARING');
  });

  it('이행 경로 밖의 상태가 섞이면 주문을 옮기지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PREPARING' }, { status: 'RETURNED' }]);

    const r = await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(r.waitingForOthers).toBe(true);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('출고 전에 취소된 줄은 기다리지 않는다 — 남은 줄이 주문을 옮긴다', async () => {
    /*
     * 예전에는 위와 같은 결과(안 옮김)였다. 부분 취소가 생기자 그러면 한 줄을 취소하고
     * 나머지를 준비한 주문이 결제완료에 영영 머문다.
     */
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PREPARING' }, { status: 'CANCELLED' }]);

    const r = await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(r.orderStatus).toBe('PREPARING');
    expect(tx.order.updateMany.mock.calls[0]![0].data.status).toBe('PREPARING');
  });

  it('취소된 줄은 옮기지 않는다 — 넣으면 남은 줄까지 못 보낸다', async () => {
    db.order.findFirst.mockResolvedValue({
      ...mixedOrder('PAID'),
      items: [
        { id: 'i-a', status: 'PAID', merchantId: 'm-a', canceledAt: null },
        { id: 'i-x', status: 'CANCELLED', merchantId: 'm-a', canceledAt: new Date() },
      ],
    });
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PREPARING' }, { status: 'CANCELLED' }]);

    await transitionOrder('20260831-1234567', 'PREPARING', merchantA);
    expect(tx.orderItem.updateMany.mock.calls[0]![0].where.id).toEqual({ in: ['i-a'] });
  });

  it('주문이 뒤처져 있으면 한 홉을 건너뛰어서라도 따라간다', async () => {
    // 줄은 이미 둘 다 배송중인데 주문은 결제완료에 머물러 있던 상황.
    // 주문 상태에까지 단일 홉 전이를 강요해서 생긴 버그였다.
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'SHIPPED' }, { status: 'SHIPPED' }]);

    const r = await transitionOrder('20260831-1234567', 'PREPARING', admin);
    expect(r.orderStatus).toBe('SHIPPED');
    expect(tx.order.updateMany.mock.calls[0]![0].data.status).toBe('SHIPPED');
  });

  /*
   * **반품 승인을 받은 주문이 영영 환불되지 않았다.** 줄은 반품완료가 되는데
   * 주문은 반품접수에 남았고, 반품접수에서 환불로 가는 길은 없다. 화면은
   * 그러면서 "다른 가맹점 상품이 남아" 라고 말했다 — 기다릴 상대가 없는데.
   */
  it('모든 줄이 반품완료면 주문도 반품완료가 된다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('RETURN_REQUESTED'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'RETURNED' }, { status: 'RETURNED' }]);

    const r = await transitionOrder('20260831-1234567', 'RETURNED', admin);

    expect(r.waitingForOthers).toBe(false);
    expect(r.orderStatus).toBe('RETURNED');
    expect(tx.order.updateMany.mock.calls[0]![0].data.status).toBe('RETURNED');
  });

  it('줄과 주문이 이미 같으면 주문을 건드리지 않는다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('PAID'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'PAID' }, { status: 'PAID' }]);

    const r = await transitionOrder('20260831-1234567', 'PREPARING', admin);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(r.orderStatus).toBe('PAID');
  });
});

describe('구매확정 적립', () => {
  const confirmable = () => ({
    id: 'o-1', orderNo: '20260831-1234567', status: 'DELIVERED',
    userId: 'u-1', rewardPoints: 2890,
    items: [{ id: 'i-1', status: 'DELIVERED', merchantId: 'm-a' }],
  });

  beforeEach(() => {
    db.order.findFirst.mockResolvedValue(confirmable());
    tx.orderItem.findMany.mockResolvedValue([{ status: 'CONFIRMED' }]);
  });

  it('확정하면 적립을 지급한다', async () => {
    const r = await transitionOrder('20260831-1234567', 'CONFIRMED', admin);

    expect(r.rewardGranted).toBe(2890);
    expect(tx.pointTransaction.create.mock.calls[0]?.[0].data).toMatchObject({
      reason: 'EARN_PURCHASE', amount: 2890,
    });
  });

  it('그 사이 다른 요청이 먼저 확정시켰으면 적립하지 않는다', async () => {
    // 조건부 UPDATE 가 0건 = 내가 확정시킨 것이 아니다.
    // 그냥 update 였다면 성공한 것처럼 보이고 적립이 두 번 나간다.
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      transitionOrder('20260831-1234567', 'CONFIRMED', admin),
    ).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });

  it('확정이 아닌 전이에서는 적립하지 않는다', async () => {
    db.order.findFirst.mockResolvedValue({
      ...confirmable(),
      status: 'PREPARING',
      items: [{ id: 'i-1', status: 'PREPARING', merchantId: 'm-a' }],
    });
    tx.orderItem.findMany.mockResolvedValue([{ status: 'SHIPPED' }]);

    const r = await transitionOrder('20260831-1234567', 'SHIPPED', admin);

    expect(r.rewardGranted).toBe(0);
    expect(tx.pointTransaction.create).not.toHaveBeenCalled();
  });
});

describe('환불 우회 차단', () => {
  /**
   * 예전에는 이 함수가 REFUNDED 도 받아 줬다. 그래서 어드민이 환불완료로
   * 바꿔도 PG 취소가 나가지 않은 채 화면에만 환불됐다고 적혔다.
   * 실수로든 새 코드로든 같은 길이 다시 열리면 여기서 걸린다.
   */
  it('상태 변경으로는 환불할 수 없다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('RETURNED'));

    await expect(transitionOrder('20260831-1234567', 'REFUNDED', admin))
      .rejects.toMatchObject({ code: 'USE_REFUND' });
  });

  it('권한을 보기도 전에 막는다 — 슈퍼관리자도 예외가 아니다', async () => {
    const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
    db.order.findFirst.mockResolvedValue(mixedOrder('CANCELLED'));

    await expect(transitionOrder('20260831-1234567', 'REFUNDED', superAdmin))
      .rejects.toMatchObject({ code: 'USE_REFUND' });
    // 주문을 읽지도 않는다
    expect(db.order.findFirst).not.toHaveBeenCalled();
  });

  it('반품완료는 그대로 받는다 — 막은 것은 환불뿐이다', async () => {
    db.order.findFirst.mockResolvedValue(mixedOrder('RETURN_REQUESTED'));
    tx.orderItem.findMany.mockResolvedValue([{ status: 'RETURNED' }, { status: 'RETURNED' }]);

    await expect(transitionOrder('20260831-1234567', 'RETURNED', admin)).resolves.toBeDefined();
  });
});
