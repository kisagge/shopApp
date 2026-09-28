import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 출고·도착 알림.
 *
 * **이 둘만 메일이 안 나갔다.** 주문접수·입금·취소·환불·반품 판정·문의 답변, 심지어 **교환 상품 발송**까지
 * 메일이 가는데 "보냈습니다 / 도착했습니다" 는 알림함에만 남았다. 사는 사람이 가장 기다리는 소식이 그것이고,
 * 알림함 하나뿐이면 다시 들어오지 않는 한 모른다.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  shipment: { findFirst: vi.fn<(...a: any[]) => any>() },
  mailTemplate: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));

const { notifyShipmentStage, orderShippedMail, orderDeliveredMail } =
  await import('~/lib/orders/notify-shipment');

const KIM = { email: 'kim@plain.test', name: '김손님', locale: 'ko', deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(KIM);
  db.shipment.findFirst.mockResolvedValue({ carrier: 'CJ', trackingNumber: '123456789012' });
  db.mailTemplate.findUnique.mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

const sent = () => send.mock.calls[0]![0] as { subject: string; text: string; html: string; to: string };

describe('출고', () => {
  it('메일과 알림함 둘 다로 알린다', async () => {
    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', kind: 'ORDER_SHIPPED' }),
    );
  });

  it('송장을 적는다 — 알림을 받고 가장 먼저 하는 일이 배송 조회다', async () => {
    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    // 조회 주소는 택배사 사정으로 바뀔 수 있어 번호를 늘 함께 적는다
    expect(sent().text).toContain('1234-5678-9012');
    expect(sent().text).toContain('CJ대한통운');
  });

  it('송장이 없으면 조회 자리를 통째로 뺀다 — 빈 칸은 "번호가 사라졌다" 로 읽힌다', async () => {
    db.shipment.findFirst.mockResolvedValue(null);

    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(sent().text).not.toContain('송장');
  });

  it('칸이 비어 있는 줄도 같다', async () => {
    db.shipment.findFirst.mockResolvedValue({ carrier: null, trackingNumber: null });

    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    expect(sent().text).not.toContain('송장');
  });
});

describe('도착', () => {
  it('메일과 알림함 둘 다로 알린다', async () => {
    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'DELIVERED' });

    expect(sent().subject).toContain('배송 완료');
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'ORDER_DELIVERED' }),
    );
  });

  it('도착 메일에는 송장을 묻지 않는다 — 이미 받은 물건이다', async () => {
    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'DELIVERED' });

    expect(db.shipment.findFirst).not.toHaveBeenCalled();
  });

  it('주문 화면으로 보낸다 — 반품·교환을 신청하는 자리다', async () => {
    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'DELIVERED' });

    expect(sent().text).toContain('/order/20260915-1234567');
  });
});

describe('받는 사람', () => {
  it('탈퇴한 계정에는 보내지 않는다 — 주소가 지워졌다', async () => {
    db.user.findUnique.mockResolvedValue({ ...KIM, deletedAt: new Date('2026-09-01') });

    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('받는 사람의 말로 쓴다 — 처리한 운영자의 말이 아니다', async () => {
    db.user.findUnique.mockResolvedValue({ ...KIM, locale: 'ja' });

    await notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' });

    expect(sent().subject).toContain('発送');
  });

  /**
   * **알림이 실패했다고 사람이 한 처리를 무를 수는 없다.** 부르는 자리에서 본 일(상태 변경)은 이미 끝났다 —
   * 다른 알림들과 같은 판단이다.
   */
  it('읽다가 넘어져도 던지지 않는다', async () => {
    db.user.findUnique.mockRejectedValue(new Error('DB 가 안 열린다'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      notifyShipmentStage({ orderNo: '20260915-1234567', userId: 'u-1', stage: 'SHIPPED' }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

describe('문구', () => {
  it('운영이 고친 문구를 쓴다 — 다른 메일은 다 되는데 이 둘만 안 될 이유가 없다', () => {
    const mail = orderShippedMail(
      { to: 'kim@plain.test', name: '김손님', orderNo: '20260915-1234567', locale: 'ko', shipment: null },
      { subject: '보냈어요 {orderNo}', heading: '출발!', lead: '{name}님 곧 도착합니다' },
    );

    expect(mail.subject).toBe('보냈어요 20260915-1234567');
    expect(mail.html).toContain('출발!');
    expect(mail.text).toContain('김손님님 곧 도착합니다');
  });

  it('도착 메일도 같다', () => {
    const mail = orderDeliveredMail(
      { to: 'kim@plain.test', name: '김손님', orderNo: '20260915-1234567', locale: 'ko' },
      { subject: '도착 {orderNo}', heading: '받으셨나요', lead: '{name}님 확인해 주세요' },
    );

    expect(mail.subject).toBe('도착 20260915-1234567');
    expect(mail.html).toContain('받으셨나요');
  });
});
