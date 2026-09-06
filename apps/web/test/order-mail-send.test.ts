import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, type PaymentGateway } from '@shop/core';

/**
 * 안내 메일이 **결제가 성립한 순간에** 나가는가.
 *
 * 주문을 만들 때 보내면 결제 화면에서 떠난 사람에게도 "주문이 완료되었습니다"
 * 가 간다 — 그런 주문이 재고를 물고 있었던 것을 앞서 봤다.
 */

const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => Promise.resolve()));
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
vi.mock('~/lib/analytics/server', () => ({ recordServerEvent: vi.fn(() => Promise.resolve()) }));

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

const { confirmPayment } = await import('~/lib/orders/confirm-payment');

const order = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', orderNo: '20260906-1234567', status: 'PENDING', payable: 289_000,
  browserSessionId: 'sess-1',
  locale: 'en', recipient: 'Demo', postalCode: '04524',
  address1: '110 Sejong-daero', address2: null,
  items: [{ quantity: 2, productName: 'Wool coat', optionLabel: 'M / Black', unitPrice: 144_500 }],
  payment: { id: 'p-1', status: 'READY', pgPaymentKey: null },
  user: { email: 'demo@plain.test', name: 'Demo' },
  ...over,
});

const gateway = (over: Partial<PaymentGateway> = {}): PaymentGateway => ({
  provider: 'mock',
  inquire: vi.fn<(...a: any[]) => any>(),
  confirm: vi.fn<(...a: any[]) => any>(async ({ amount }) => ({
    paymentKey: 'pk_1', approvalNo: 'A1', method: 'CARD' as const, status: 'DONE' as const,
    amount: won(amount), approvedAt: new Date('2026-09-06T06:00:00Z'),
    virtualAccount: null, raw: {},
  })),
  cancel: vi.fn<(...a: any[]) => any>(),
  ...over,
});

const sent = () => send.mock.calls[0]![0] as { to: string; subject: string; text: string };

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue(order());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.order.updateMany.mockResolvedValue({ count: 1 });
});

const confirm = (gw: PaymentGateway) =>
  confirmPayment({ orderNo: '20260906-1234567', paymentKey: 'pk_1', amount: 289_000 }, { id: 'u-1' }, gw);

describe('결제가 확정되면 안내가 나간다', () => {
  it('구매자에게 보낸다', async () => {
    await confirm(gateway());

    expect(send).toHaveBeenCalledOnce();
    expect(sent().to).toBe('demo@plain.test');
  });

  it('주문에 남은 말로 보낸다 — 주문서를 본 말이어야 대조할 수 있다', async () => {
    await confirm(gateway());
    expect(sent().subject).toContain('Your order is confirmed');
  });

  it('가상계좌는 아직 입금 전이라 다른 말을 보낸다', async () => {
    const gw = gateway({
      confirm: vi.fn<(...a: any[]) => any>(async ({ amount }) => ({
        paymentKey: 'pk_1', approvalNo: null, method: 'VIRTUAL_ACCOUNT' as const,
        status: 'WAITING_FOR_DEPOSIT' as const, amount: won(amount), approvedAt: null,
        virtualAccount: { bank: '국민', accountNumber: '12345678901234', dueDate: null },
        raw: {},
      })),
    });

    await confirm(gw);

    expect(sent().subject).toContain('Waiting for your deposit');
    // 계좌번호가 없으면 화면을 닫는 순간 어디로 넣을지 알 수 없다
    expect(sent().text).toContain('12345678901234');
  });

  /**
   * **메일이 결제를 되돌릴 수는 없다.** 승인은 이미 났고 돈은 빠져나갔다.
   */
  it('메일이 실패해도 결제 확정은 성립한다', async () => {
    send.mockRejectedValueOnce(new Error('메일 서버 장애'));

    await expect(confirm(gateway())).resolves.toMatchObject({ orderStatus: 'PAID' });
  });

  it('승인이 실패하면 아무것도 보내지 않는다', async () => {
    const gw = gateway({
      confirm: vi.fn<(...a: any[]) => any>(async () => {
        throw new Error('PG 거절');
      }),
    });

    await expect(confirm(gw)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});
