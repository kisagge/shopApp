import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PaymentGateway } from '@shop/core';

const db = vi.hoisted(() => ({
  payment: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
  },
  order: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { updateMany: vi.fn<(...a: any[]) => any>() },
  orderStatusLog: { create: vi.fn<(...a: any[]) => any>() },
  eventLog: { createMany: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const notifyLateDepositFound = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/late-deposit', () => ({ notifyLateDepositFound }));

/*
 * **입금이 확인됐다는 안내.** 여기서 볼 것은 **언제 부르는가** 다 — 메일 문안과
 * 알림함 기록은 그쪽 검사가 본다(`order-mail`·`deliver-notice`). 보내는 자리를
 * 흉내 내되 말·금액을 읽는 함수(orderLocale·shipToLine)는 그대로 쓴다.
 */
const deliverOrderNotice = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('~/lib/orders/notify', async (orig) => ({
  ...(await orig<typeof import('~/lib/orders/notify')>()),
  deliverOrderNotice,
}));

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
    // 조회가 id 까지 읽는다 — 알림함에 남기려면 누구의 것인지 알아야 한다
    user: { id: 'u-1', email: 'demo@plain.test', name: '데모 고객' },
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.payment.findUnique.mockResolvedValue(payment());
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.payment.updateMany.mockResolvedValue({ count: 1 });
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

/**
 * **결제 대기가 아닌 주문에 들어온 입금.**
 *
 * 대개 손님이 취소한 뒤 입금한 것이다. 예전에는 "결제완료로 옮기기" 를 계산하다 상태머신이 던져서
 * 웹훅이 500 을 받고 끝없이 재시도했고, 받은 돈은 아무 데도 적히지 않았다.
 */
describe('취소한 주문에 들어온 입금', () => {
  const cancelled = () => {
    const base = payment();
    return { ...base, status: 'ABORTED', order: { ...base.order, status: 'CANCELLED' } };
  };

  it('던지지 않고, 받은 돈을 결제에 남기고, 반영하지 않았다고 답한다', async () => {
    db.payment.findUnique.mockResolvedValue(cancelled());

    const outcome = await applyDeposit('pk_1', gateway());

    expect(outcome).toMatchObject({ applied: false });
    expect(db.payment.updateMany).toHaveBeenCalledWith({
      where: { id: 'pay-1', lateDepositAt: null },
      data: { lateDepositAt: new Date('2026-09-03T02:00:00Z'), lateDepositAmount: 289000 },
    });
    // 주문은 취소된 그대로다
    expect(db.order.updateMany).not.toHaveBeenCalled();
    // 돈을 보낸 손님과 돌려줄 운영진이 듣는다 — PG 가 알려 준 금액으로
    expect(notifyLateDepositFound).toHaveBeenCalledWith({ orderNo: '20260903-0000001', userId: 'u-1', amount: 289000 });
  });

  it('PG 가 알려 준 금액을 적는다 — 사람이 보내므로 주문 금액과 다를 수 있다', async () => {
    db.payment.findUnique.mockResolvedValue(cancelled());
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'DONE' as const, amount: 100000, approvedAt: null, virtualAccount: null, raw: {},
      })),
    });

    await applyDeposit('pk_1', g);

    expect(db.payment.updateMany.mock.calls[0]![0].data.lateDepositAmount).toBe(100000);
  });

  it('다시 와도 한 번만 적고 소리 내지 않는다 — 웹훅은 여러 번 온다', async () => {
    db.payment.findUnique.mockResolvedValue(cancelled());
    db.payment.updateMany.mockResolvedValue({ count: 0 });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(applyDeposit('pk_1', gateway())).resolves.toMatchObject({ applied: false });

    expect(error).not.toHaveBeenCalled();
    // 두 번째 신호에 같은 알림을 또 보내지 않는다
    expect(notifyLateDepositFound).not.toHaveBeenCalled();
  });

  it('처음 적을 때는 크게 남긴다 — 사람이 돌려줘야 하는 돈이다', async () => {
    db.payment.findUnique.mockResolvedValue(cancelled());
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await applyDeposit('pk_1', gateway());

    expect(error).toHaveBeenCalledWith(expect.stringContaining('사람이 환불해야 한다'), expect.objectContaining({ orderNo: '20260903-0000001' }));
  });

  it('아직 입금 전이면 아무것도 적지 않는다', async () => {
    db.payment.findUnique.mockResolvedValue(cancelled());
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'CANCELED' as const, amount: 289000, approvedAt: null, virtualAccount: null, raw: {},
      })),
    });

    await applyDeposit('pk_1', g);

    expect(db.payment.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * **돈을 보낸 사람에게 그 사실을 알린다.**
 *
 * 이 길에는 검사가 둘이나 있었는데(여기와 `toss-webhook`) **안내를 아무도
 * 보지 않았다.** 그 한 줄을 지워도 전부 초록이다 — 그리고 사라지는 것은
 * 손님이 계좌로 돈을 보낸 뒤 받는 유일한 확인이다. 안 오면 입금이 안 된
 * 줄 알고 다시 보내거나 전화를 한다.
 *
 * 안내는 메일과 알림함 둘을 함께 내보낸다(`deliverOrderNotice`).
 */
describe('입금 확인 안내', () => {
  it('입금이 확인되면 그 주문의 구매자에게 한 번 알린다', async () => {
    await applyDeposit('pk_1', gateway());

    expect(deliverOrderNotice).toHaveBeenCalledOnce();
    const [kind, input] = deliverOrderNotice.mock.calls[0]!;
    expect(kind).toBe('deposited');
    expect(input).toMatchObject({
      userId: 'u-1',
      to: 'demo@plain.test',
      buyerName: '데모 고객',
      orderNo: '20260903-0000001',
    });
  });

  it('주문이 들고 있던 말로 보낸다 — 입금한 순간의 말을 알 길이 여기엔 없다', async () => {
    db.payment.findUnique.mockResolvedValue(payment({
      order: { ...payment().order, locale: 'ja' },
    }));

    await applyDeposit('pk_1', gateway());

    expect(deliverOrderNotice.mock.calls[0]![1]).toMatchObject({ locale: 'ja' });
  });

  it('주문서에 적힌 금액과 줄, 보낼 곳을 함께 싣는다', async () => {
    await applyDeposit('pk_1', gateway());

    const input = deliverOrderNotice.mock.calls[0]![1];
    expect(input.payable).toBe(289_000);
    expect(input.items).toHaveLength(1);
    expect(input.shipTo).toContain('서울 중구 세종대로 110');
  });

  it.each([
    ['아직 입금 전이면', 'WAITING_FOR_DEPOSIT' as const, 289_000],
    ['금액이 모자라면', 'DONE' as const, 1_000],
    ['금액이 넘치면', 'DONE' as const, 500_000],
  ])('%s 알리지 않는다', async (_what, status, amount) => {
    const g = gateway({
      inquire: vi.fn<(...a: any[]) => any>(async () => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status, amount, approvedAt: new Date(), virtualAccount: null, raw: {},
      })),
    });

    await applyDeposit('pk_1', g);

    expect(deliverOrderNotice).not.toHaveBeenCalled();
  });

  it('우리 결제가 아니면 알리지 않는다', async () => {
    db.payment.findUnique.mockResolvedValue(null);

    await applyDeposit('pk_unknown', gateway());

    expect(deliverOrderNotice).not.toHaveBeenCalled();
  });

  it('이미 반영된 입금이면 다시 알리지 않는다 — 웹훅은 여러 번 온다', async () => {
    db.payment.findUnique.mockResolvedValue(payment({ status: 'DONE' }));

    await applyDeposit('pk_1', gateway());

    expect(deliverOrderNotice).not.toHaveBeenCalled();
  });

  it('경합에서 다른 처리가 먼저 반영했으면 알리지 않는다', async () => {
    /*
     * **예전에는 트랜잭션 안에서만 빠져나가고 바깥은 그대로 돌았다** — 같은
     * 매출이 두 번 찍힐 수 있었다. 안내도 같은 자리에 있으므로 같은 모양으로
     * 두 번 갈 수 있었다: 돈을 한 번 보낸 사람이 확인 메일을 두 통 받는다.
     */
    db.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await applyDeposit('pk_1', gateway());

    expect(result.applied).toBe(false);
    expect(deliverOrderNotice).not.toHaveBeenCalled();
    expect(db.eventLog.createMany).not.toHaveBeenCalled();
  });

  it('매출 기록과 짝이다 — 둘 중 하나만 남는 입금은 없다', async () => {
    await applyDeposit('pk_1', gateway());

    expect(db.eventLog.createMany).toHaveBeenCalled();
    expect(deliverOrderNotice).toHaveBeenCalled();
  });
});
