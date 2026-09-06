import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentGateway } from '@shop/core';

const db = vi.hoisted(() => ({
  payment: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  eventLog: { createMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { applyDeposit } = await import('~/lib/payments/deposit');

const gateway = (over: Partial<PaymentGateway> = {}): PaymentGateway => ({
  provider: 'mock',
  confirm: vi.fn<(...a: any[]) => any>(),
  cancel: vi.fn<(...a: any[]) => any>(),
  inquire: vi.fn<(...a: any[]) => any>(async () => ({
    paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
    status: 'DONE' as const, amount: 289000, approvedAt: new Date('2026-09-03T02:00:00Z'),
    virtualAccount: null, raw: {},
  })),
  ...over,
});

const payment = (over: Record<string, unknown> = {}) => ({
  id: 'pay-1',
  status: 'WAITING_FOR_DEPOSIT',
  amount: 289000,
  order: {
    id: 'o-1', orderNo: '20260903-0000001', status: 'PENDING',
    userId: 'u-1', browserSessionId: 'sess-1',
    // 안내 메일이 읽는 값들
    locale: 'ko', payable: 289_000, recipient: '데모', postalCode: '04524',
    address1: '서울 중구 세종대로 110', address2: null,
    items: [{ productName: '울 코트', optionLabel: 'M / 블랙', quantity: 1, unitPrice: 289_000 }],
    user: { email: 'demo@plain.test', name: '데모 고객' },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.payment.findUnique.mockResolvedValue(payment());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.eventLog.createMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('웹훅 본문을 믿지 않는다', () => {
  it('상태는 PG 에 다시 물어서 정한다', async () => {
    const g = gateway();
    await applyDeposit('pk_1', g);

    // 본문에 무엇이 적혀 있든 조회 결과로 판단한다
    expect(g.inquire).toHaveBeenCalledWith('pk_1');
    expect(db.order.updateMany).toHaveBeenCalled();
  });

  it('조회가 아직 입금 전이라고 하면 반영하지 않는다', async () => {
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'WAITING_FOR_DEPOSIT' as const, amount: 289000,
        approvedAt: null, virtualAccount: null, raw: {},
      })),
    });

    const result = await applyDeposit('pk_1', g);

    expect(result.applied).toBe(false);
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('우리 결제가 아니면 아무것도 하지 않는다', async () => {
    db.payment.findUnique.mockResolvedValue(null);
    const g = gateway();

    const result = await applyDeposit('pk_남의것', g);

    expect(result.applied).toBe(false);
    // PG 에 물어보지도 않는다 — 모르는 키로 조회를 날릴 이유가 없다
    expect(g.inquire).not.toHaveBeenCalled();
  });
});

describe('입금액', () => {
  it('주문 금액과 다르면 반영하지 않는다 — 덜 보내고 결제 완료가 되면 손해다', async () => {
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'DONE' as const, amount: 1000, // 289,000 원 주문에 1,000 원만 들어왔다
        approvedAt: new Date(), virtualAccount: null, raw: {},
      })),
    });

    const result = await applyDeposit('pk_1', g);

    expect(result.applied).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringContaining('금액') });
    expect(db.order.updateMany).not.toHaveBeenCalled();
  });

  it('더 많이 보내도 반영하지 않는다 — 사람이 확인할 일이다', async () => {
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'DONE' as const, amount: 500000,
        approvedAt: new Date(), virtualAccount: null, raw: {},
      })),
    });

    expect((await applyDeposit('pk_1', g)).applied).toBe(false);
  });
});

describe('여러 번 와도 한 번만 반영한다', () => {
  it('이미 DONE 이면 조회조차 하지 않는다', async () => {
    db.payment.findUnique.mockResolvedValue(payment({ status: 'DONE' }));
    const g = gateway();

    const result = await applyDeposit('pk_1', g);

    expect(result.applied).toBe(false);
    expect(g.inquire).not.toHaveBeenCalled();
  });

  it('그 사이 다른 웹훅이 먼저 처리했으면 조건부 UPDATE 가 0건을 낸다', async () => {
    db.order.updateMany.mockResolvedValue({ count: 0 });

    await applyDeposit('pk_1', gateway());

    // 상태 로그를 남기지 않는다 — 같은 전이를 두 줄로 기록하면 안 된다
    expect(db.orderStatusLog.create).not.toHaveBeenCalled();
  });
});

describe('매출 기록', () => {
  it('입금이 확인된 뒤에만 purchase 를 남기고, 주문 세션으로 찍는다', async () => {
    await applyDeposit('pk_1', gateway());

    const rows = db.eventLog.createMany.mock.calls[0]?.[0].data as any[];
    expect(rows[0]).toMatchObject({
      name: 'purchase',
      sessionId: 'sess-1', // 조회·담기와 같은 세션이라야 퍼널이 이어진다
      orderId: '20260903-0000001',
      value: 289000,
    });
  });

  it('입금 전에는 매출로 잡지 않는다', async () => {
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'WAITING_FOR_DEPOSIT' as const, amount: 289000,
        approvedAt: null, virtualAccount: null, raw: {},
      })),
    });

    await applyDeposit('pk_1', g);

    expect(db.eventLog.createMany).not.toHaveBeenCalled();
  });
});
