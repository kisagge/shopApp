import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 교환 상품 발송 알림 — 메일은 무엇이 무엇으로 바뀌어 가는지와 송장을, 알림함은 주문으로 가는 한 줄을.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  orderItem: { findMany: vi.fn<(...a: any[]) => any>() },
  mailTemplate: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));

const { exchangeShippedMail, notifyExchangeShipped } = await import('~/lib/orders/notify-exchange');

const LINES = [
  { productName: '울 코트', fromOptionLabel: '오트 / M', toOptionLabel: '오트 / L', quantity: 1 },
  { productName: '니트', fromOptionLabel: '블랙 / S', toOptionLabel: '블랙 / M', quantity: 2 },
];
const base = {
  to: 'kim@plain.test', name: '김손님', orderNo: '20260915-0000001', locale: 'ko' as const,
  carrier: 'CJ', trackingNumber: '123456789012', lines: LINES,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ email: 'kim@plain.test', name: '김손님', locale: 'ko', deletedAt: null });
  db.orderItem.findMany.mockResolvedValue([{ id: 'i-coat', productName: '울 코트' }]);
  db.mailTemplate.findUnique.mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

describe('교환 발송 메일', () => {
  it('제목에 주문번호, 본문에 바뀐 옵션 줄과 송장, 조회 단추', () => {
    const mail = exchangeShippedMail(base);
    expect(mail.subject).toBe('[PLAIN] 주문 20260915-0000001 교환 상품을 보냈습니다');
    expect(mail.text).toContain('김손님님, 교환하신 상품을 보냈습니다.');
    expect(mail.text).toContain('- 울 코트: 오트 / M → 오트 / L · 1개');
    expect(mail.text).toContain('- 니트: 블랙 / S → 블랙 / M · 2개');
    expect(mail.text).toContain('송장 CJ대한통운');
    expect(mail.html).toContain('trace.cjlogistics.com');
    expect(mail.html).toContain('배송 조회');
  });

  it('조회 주소가 없는 택배사면 주문 화면으로 보낸다 — 번호는 그대로 적는다', () => {
    const mail = exchangeShippedMail({ ...base, carrier: 'ETC', trackingNumber: '99887766' });
    expect(mail.html).not.toContain('배송 조회');
    expect(mail.html).toContain('/order/20260915-0000001');
    expect(mail.text).toMatch(/9988-?7766/);
  });

  it('상품 이름에 섞인 태그는 글자로 나간다', () => {
    const mail = exchangeShippedMail({ ...base, lines: [{ ...LINES[0]!, productName: '<b>코트</b>' }] });
    expect(mail.html).not.toContain('<b>코트</b>');
    expect(mail.html).toContain('&lt;b&gt;');
  });

  it('받는 사람의 말로 쓴다', () => {
    expect(exchangeShippedMail({ ...base, locale: 'en' }).subject).toBe('[PLAIN] Your exchange for order 20260915-0000001 is on its way');
  });

  it('운영이 고친 제목을 쓰고, 값이 빠진 문구면 기본으로 물러난다', () => {
    expect(exchangeShippedMail(base, { subject: '교환 출발 {orderNo}' }).subject).toBe('교환 출발 20260915-0000001');
    expect(exchangeShippedMail(base, { lead: '{nope} 님' }).text).toContain('김손님님, 교환하신');
  });
});

describe('notifyExchangeShipped', () => {
  const input = {
    orderNo: '20260915-0000001', userId: 'u-1', carrier: 'CJ', trackingNumber: '123456789012',
    lines: [{ orderItemId: 'i-coat', fromOptionLabel: '오트 / M', toOptionLabel: '오트 / L', quantity: 1 }],
  };

  it('메일을 보내고 알림함에 주문으로 가는 알림을 남긴다', async () => {
    await notifyExchangeShipped(input);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ to: 'kim@plain.test' });
    expect(send.mock.calls[0]?.[0].text).toContain('울 코트: 오트 / M → 오트 / L');
    expect(recordNotification).toHaveBeenCalledWith({
      userId: 'u-1', kind: 'EXCHANGE_SHIPPED', params: { orderNo: '20260915-0000001' }, linkPath: '/order/20260915-0000001',
    });
  });

  it('메일이 실패해도 알림함에는 남기고, 던지지 않는다', async () => {
    send.mockRejectedValue(new Error('smtp down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyExchangeShipped(input)).resolves.toBeUndefined();
    expect(recordNotification).toHaveBeenCalled();
    error.mockRestore();
  });

  it('탈퇴한 계정에는 아무것도 보내지 않는다', async () => {
    db.user.findUnique.mockResolvedValue({ email: 'x', name: 'x', locale: null, deletedAt: new Date() });
    await notifyExchangeShipped(input);
    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('조회가 터져도 던지지 않는다 — 교환은 이미 끝났다', async () => {
    db.user.findUnique.mockRejectedValue(new Error('db'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(notifyExchangeShipped(input)).resolves.toBeUndefined();
    error.mockRestore();
  });
});
