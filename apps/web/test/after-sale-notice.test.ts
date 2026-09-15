import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 취소·반품 승인·반려·환불 알림 — 메일은 숫자·다음 할 일·사유를, 알림함은 남이 했을 때만.
 */

const db = vi.hoisted(() => ({
  order: { findUnique: vi.fn<(...a: any[]) => any>() },
  mailTemplate: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));
vi.mock('~/lib/cron', () => ({ CRON_ACTOR: { id: 'system:cron', role: 'SUPER_ADMIN', merchantId: null } }));

const { afterSaleMail, notifyAfterSale } = await import('~/lib/orders/notify-after-sale');

const ORDER_NO = '20260915-0000001';
const ITEMS = [
  { id: 'i-coat', productName: '울 코트', optionLabel: '오트 / M', quantity: 1 },
  { id: 'i-knit', productName: '니트', optionLabel: '블랙 / S', quantity: 2 },
];
const base = { to: 'kim@plain.test', name: '김손님', orderNo: ORDER_NO, locale: 'ko' as const, items: ITEMS.slice(0, 1) };

const order = (over: Record<string, unknown> = {}) => ({
  orderNo: ORDER_NO, userId: 'u-1',
  user: { email: 'kim@plain.test', name: '김손님', locale: 'ko', deletedAt: null },
  items: ITEMS,
  returnRequests: [{ type: 'RETURN', itemIds: ['i-knit'], rejectReason: '착용 흔적이 있습니다' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(order());
  db.mailTemplate.findUnique.mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

describe('메일', () => {
  it('환불은 금액·포인트·뗀 배송비를 따로 적고, 카드 환불이 늦게 보이는 이유를 붙인다', () => {
    const mail = afterSaleMail({ ...base, kind: 'REFUND_COMPLETED', items: [], money: { refunded: 24_000, pointsReturned: 1_500, shippingDeducted: 3_000 } });
    expect(mail.subject).toBe(`[PLAIN] 주문 ${ORDER_NO} 환불 완료`);
    expect(mail.text).toContain('환불 금액 24,000원');
    expect(mail.text).toContain('돌려드린 포인트 1,500P');
    expect(mail.text).toContain('차감한 배송비 3,000원');
    expect(mail.text).toContain('영업일 기준 3~5일');
  });

  it('돈이 돌아가지 않은 취소(미결제)에는 금액 줄과 카드 안내가 없다', () => {
    const mail = afterSaleMail({ ...base, kind: 'ORDER_CANCELLED', money: { refunded: 0, pointsReturned: 0, shippingDeducted: 0 } });
    expect(mail.text).not.toContain('환불 금액');
    expect(mail.text).not.toContain('영업일');
    expect(mail.text).toContain('- 울 코트 (오트 / M) · 1개');
  });

  it('승인은 반품·교환에 따라 다음에 할 일을, 반려는 사유와 문의 길을 적는다', () => {
    expect(afterSaleMail({ ...base, kind: 'RETURN_APPROVED', returnType: 'RETURN' }).text).toContain('환불해 드립니다');
    expect(afterSaleMail({ ...base, kind: 'RETURN_APPROVED', returnType: 'EXCHANGE' }).text).toContain('바꾼 상품을 보내 드립니다');
    const rejected = afterSaleMail({ ...base, kind: 'RETURN_REJECTED', returnType: 'RETURN', reason: '착용 흔적' });
    expect(rejected.text).toContain('사유 착용 흔적');
    expect(rejected.text).toContain('문의로 남겨 주세요');
  });

  it('받는 사람의 말로, 고친 문구가 있으면 그것으로', () => {
    expect(afterSaleMail({ ...base, kind: 'ORDER_CANCELLED', locale: 'en' }).subject).toBe(`[PLAIN] Order ${ORDER_NO} cancelled`);
    expect(afterSaleMail({ ...base, kind: 'ORDER_CANCELLED' }, { subject: '취소됐어요 {orderNo}' }).subject).toBe(`취소됐어요 ${ORDER_NO}`);
  });

  it('사유에 섞인 태그는 글자로 나간다', () => {
    const mail = afterSaleMail({ ...base, kind: 'RETURN_REJECTED', reason: '<script>x</script>' });
    expect(mail.html).not.toContain('<script>');
  });
});

describe('notifyAfterSale', () => {
  it('운영진이 취소하면 메일과 알림함 둘 다 — 운영 메모는 손님에게 보이지 않는다', async () => {
    await notifyAfterSale({ kind: 'ORDER_CANCELLED', orderNo: ORDER_NO, actorId: 'u-admin', reason: '어드민 취소' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].text).not.toContain('어드민 취소');
    expect(recordNotification).toHaveBeenCalledWith({
      userId: 'u-1', kind: 'ORDER_CANCELLED', params: { orderNo: ORDER_NO }, linkPath: `/order/${ORDER_NO}`,
    });
  });

  it('손님이 스스로 취소하면 메일만 — 적은 사유는 보인다', async () => {
    await notifyAfterSale({ kind: 'ORDER_CANCELLED', orderNo: ORDER_NO, actorId: 'u-1', reason: '사이즈 착오' });
    expect(send.mock.calls[0]![0].text).toContain('사유 사이즈 착오');
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('배치가 취소하면 사유를 받는 사람의 말로 적는다', async () => {
    db.order.findUnique.mockResolvedValue(order({ user: { email: 'a@b.c', name: 'Kim', locale: 'en', deletedAt: null } }));
    await notifyAfterSale({ kind: 'ORDER_CANCELLED', orderNo: ORDER_NO, actorId: 'system:cron' });
    expect(send.mock.calls[0]![0].text).toContain('Payment was not completed in time');
    expect(recordNotification).toHaveBeenCalled();
  });

  it('일부 취소는 고른 줄만, 반품 알림은 신청한 줄과 반려 사유를 신청에서 읽는다', async () => {
    await notifyAfterSale({ kind: 'ORDER_CANCELLED', orderNo: ORDER_NO, actorId: 'u-admin', itemIds: ['i-coat'] });
    expect(send.mock.calls[0]![0].text).toContain('울 코트');
    expect(send.mock.calls[0]![0].text).not.toContain('니트');

    send.mockClear();
    await notifyAfterSale({ kind: 'RETURN_REJECTED', orderNo: ORDER_NO, actorId: 'u-admin' });
    const text = send.mock.calls[0]![0].text as string;
    expect(text).toContain('니트');
    expect(text).not.toContain('울 코트');
    expect(text).toContain('사유 착용 흔적이 있습니다');
    expect(text).toContain('신청 반품');
  });

  it('메일이 실패해도 알림함에는 남기고, 탈퇴한 계정에는 아무것도 안 보내고, 던지지 않는다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    send.mockRejectedValue(new Error('smtp'));
    await expect(notifyAfterSale({ kind: 'REFUND_COMPLETED', orderNo: ORDER_NO, actorId: 'u-admin' })).resolves.toBeUndefined();
    expect(recordNotification).toHaveBeenCalled();

    vi.clearAllMocks();
    db.order.findUnique.mockResolvedValue(order({ user: { email: 'x', name: 'x', locale: null, deletedAt: new Date() } }));
    await notifyAfterSale({ kind: 'REFUND_COMPLETED', orderNo: ORDER_NO, actorId: 'u-admin' });
    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).not.toHaveBeenCalled();

    db.order.findUnique.mockRejectedValue(new Error('db'));
    await expect(notifyAfterSale({ kind: 'REFUND_COMPLETED', orderNo: ORDER_NO, actorId: 'u-admin' })).resolves.toBeUndefined();
    error.mockRestore();
  });
});
