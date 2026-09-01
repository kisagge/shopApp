import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, PaymentError, type PaymentGateway } from '@shop/core';

const recordServerEvent = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent }));

const tx = vi.hoisted(() => ({
  order: { updateMany: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  payment: { update: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { confirmPayment, ConfirmError } = await import('~/lib/orders/confirm-payment');

const user = { id: 'u-1' };

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260831-1234567', status: 'PENDING', payable: 289_000,
  items: [{ quantity: 2 }],
  payment: { id: 'p-1', status: 'READY', pgPaymentKey: null },
  ...over,
});

const gateway = (over: Partial<PaymentGateway> = {}): PaymentGateway => ({
  provider: 'mock',
  confirm: vi.fn<(...a: any[]) => any>(async ({ amount }) => ({
    paymentKey: 'pk_1', approvalNo: 'A1', method: 'CARD' as const, status: 'DONE' as const,
    amount: won(amount), approvedAt: new Date('2026-08-31T06:00:00Z'),
    virtualAccount: null, raw: {},
  })),
  cancel: vi.fn<(...a: any[]) => any>(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
});

describe('금액 검증 — 여기가 뚫리면 1원으로 물건을 산다', () => {
  it('주문 금액과 다르면 승인하지 않는다', async () => {
    const gw = gateway();
    await expect(
      confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 1 }, user, gw),
    ).rejects.toBeInstanceOf(PaymentError);
    expect(gw.confirm).not.toHaveBeenCalled();
  });

  it('PG 에는 요청 금액이 아니라 주문에 저장된 금액을 넘긴다', async () => {
    const gw = gateway();
    await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gw);
    expect(gw.confirm).toHaveBeenCalledWith({
      paymentKey: 'pk_1', orderNo: '20260831-1234567', amount: 289_000,
    });
  });
});

describe('멱등 — 결제창이 콜백을 두 번 부르는 일은 흔하다', () => {
  it('같은 paymentKey 로 다시 오면 PG 를 부르지 않고 성공을 돌려준다', async () => {
    db.order.findFirst.mockResolvedValue(
      order({ status: 'PAID', payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk_1' } }),
    );
    const gw = gateway();
    const r = await confirmPayment(
      { orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gw,
    );
    expect(r.alreadyConfirmed).toBe(true);
    expect(gw.confirm).not.toHaveBeenCalled();
  });

  it('이미 처리된 주문에 다른 결제로 오면 거절한다', async () => {
    db.order.findFirst.mockResolvedValue(
      order({ status: 'PAID', payment: { id: 'p-1', status: 'DONE', pgPaymentKey: 'pk_old' } }),
    );
    await expect(
      confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_new', amount: 289_000 }, user, gateway()),
    ).rejects.toMatchObject({ code: 'ALREADY_PROCESSED' });
  });

  it('그 사이 다른 요청이 먼저 처리했으면(조건부 UPDATE 0건) 거절한다', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway()),
    ).rejects.toBeInstanceOf(ConfirmError);
  });
});

describe('승인 성공', () => {
  it('주문을 PAID 로 옮기고 이력을 남긴다', async () => {
    await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway());
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o-1', status: 'PENDING' },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
    expect(tx.orderStatusLog.create.mock.calls[0]![0].data).toMatchObject({
      from: 'PENDING', to: 'PAID',
    });
  });

  it('PG 응답 원문을 저장한다 — 대사와 장애 분석에 필요하다', async () => {
    await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway());
    expect(tx.payment.update.mock.calls[0]![0].data).toMatchObject({
      status: 'DONE', pgPaymentKey: 'pk_1', pgApprovalNo: 'A1', pgProvider: 'mock',
    });
    expect(tx.payment.update.mock.calls[0]![0].data.rawResponse).toBeDefined();
  });

  it('purchase 이벤트는 결제가 성립한 순간에만 기록한다', async () => {
    await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway());
    expect(recordServerEvent).toHaveBeenCalledOnce();
    expect(recordServerEvent.mock.calls[0]![0]).toMatchObject({
      name: 'purchase', orderId: '20260831-1234567', value: 289_000, quantity: 2, userId: 'u-1',
    });
  });
});

describe('가상계좌 — 입금 전이라 아직 결제가 아니다', () => {
  const vaGateway = gateway({
    confirm: vi.fn<(...a: any[]) => any>(async ({ amount }) => ({
      paymentKey: 'pk_va', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
      status: 'WAITING_FOR_DEPOSIT' as const, amount: won(amount), approvedAt: null,
      virtualAccount: { bank: '기업은행', accountNumber: '00012345678', dueDate: new Date('2026-09-03T00:00:00Z') },
      raw: {},
    })),
  });

  it('주문 상태를 PAID 로 옮기지 않는다', async () => {
    const r = await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_va', amount: 289_000 }, user, vaGateway);
    expect(r.orderStatus).toBe('PENDING');
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('purchase 이벤트도 아직 찍지 않는다 — 돈이 안 들어왔다', async () => {
    await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_va', amount: 289_000 }, user, vaGateway);
    expect(recordServerEvent).not.toHaveBeenCalled();
  });

  it('입금 계좌를 돌려준다', async () => {
    const r = await confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_va', amount: 289_000 }, user, vaGateway);
    expect(r.virtualAccount).toMatchObject({ bank: '기업은행', accountNumber: '00012345678' });
  });
});

describe('실패', () => {
  it('주문이 없으면 404 로 표시한다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(
      confirmPayment({ orderNo: 'x', paymentKey: 'pk_1', amount: 1 }, user, gateway()),
    ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
  });

  it('PG 가 거절하면 그대로 전달한다', async () => {
    const gw = gateway({
      confirm: vi.fn<(...a: any[]) => any>(() => Promise.reject(new PaymentError('REJECT_CARD_COMPANY', '카드사 거절'))),
    });
    await expect(
      confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gw),
    ).rejects.toMatchObject({ code: 'REJECT_CARD_COMPANY' });
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('승인 후 DB 반영이 실패하면 대사할 수 있게 남긴다 — 돈은 이미 빠져나갔다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.$transaction.mockRejectedValue(new Error('DB 다운'));
    await expect(
      confirmPayment({ orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway()),
    ).rejects.toThrow('DB 다운');
    expect(spy.mock.calls[0]![0]).toContain('수동 대사 필요');
    spy.mockRestore();
  });
});

describe('퍼널을 이어 붙인다', () => {
  it('주문에 담긴 브라우저 세션으로 purchase 를 찍는다', async () => {
    // 다른 세션으로 찍으면 조회·담기와 이어지지 않아 전환율이 영원히 0% 다
    db.order.findFirst.mockResolvedValue(order({ browserSessionId: 'sess_browser01' }));
    await confirmPayment(
      { orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway(),
    );
    expect(recordServerEvent.mock.calls[0]![0]).toMatchObject({
      name: 'purchase', sessionId: 'sess_browser01', anonymousId: 'sess_browser01',
    });
  });

  it('세션을 못 받았으면 주문번호로 대신한다 — 그 건은 퍼널에서 빠진다', async () => {
    db.order.findFirst.mockResolvedValue(order({ browserSessionId: null }));
    await confirmPayment(
      { orderNo: '20260831-1234567', paymentKey: 'pk_1', amount: 289_000 }, user, gateway(),
    );
    expect(recordServerEvent.mock.calls[0]![0].sessionId).toBe('order-20260831-1234567');
  });
});
