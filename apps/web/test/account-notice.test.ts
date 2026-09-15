import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 계정 알림 — 적립금 지급·차감, 이용 정지·해제. 메일에는 사유·잔액·무엇이 막히는지를, 정지는 알림함에 남기지 않는다.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  mailTemplate: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));

const { accountMail, notifyPointsAdjusted, notifySuspension } = await import('~/lib/account/notify-account');

const base = { to: 'kim@plain.test', name: '김손님', locale: 'ko' as const };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ email: 'kim@plain.test', name: '김손님', locale: 'ko', deletedAt: null });
  db.mailTemplate.findUnique.mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

describe('메일', () => {
  it('지급: 포인트·사유·지금 잔액·소멸 예정일, 적립금 내역으로 가는 단추', () => {
    const mail = accountMail({ ...base, kind: 'POINTS_GRANTED', points: 3_000, balance: 12_500, reason: '배송 지연 보상', expiresAt: new Date('2027-09-15T03:00:00Z') });
    expect(mail.subject).toBe('[PLAIN] 적립금 3,000P가 지급되었습니다');
    expect(mail.text).toContain('김손님님, 적립금 3,000P를 드렸습니다.');
    expect(mail.text).toContain('사유 배송 지연 보상');
    expect(mail.text).toContain('지금 잔액 12,500P');
    expect(mail.text).toMatch(/소멸 예정일 2027/);
    expect(mail.text).toContain('/mypage/points');
  });

  it('차감: 소멸일은 없다', () => {
    const mail = accountMail({ ...base, kind: 'POINTS_DEDUCTED', points: 1_000, balance: 0, reason: '잘못 준 적립' });
    expect(mail.text).toContain('적립금 1,000P가 차감되었습니다.');
    expect(mail.text).toContain('지금 잔액 0P');
    expect(mail.text).not.toContain('소멸 예정일');
  });

  it('정지: 사유와 무엇이 막히고 무엇은 그대로인지, 단추는 로그인 없이 가는 고객센터', () => {
    const mail = accountMail({ ...base, kind: 'ACCOUNT_SUSPENDED', reason: '결제 도용 의심' });
    expect(mail.text).toContain('사유 결제 도용 의심');
    expect(mail.text).toContain('이미 결제한 주문의 배송·취소·환불은 그대로 처리됩니다.');
    expect(mail.html).toContain('/support');
    expect(mail.html).not.toContain('/login');
  });

  it('해제: 로그인 단추, 받는 사람의 말로, 고친 문구도', () => {
    expect(accountMail({ ...base, kind: 'ACCOUNT_RESTORED' }).html).toContain('/login');
    expect(accountMail({ ...base, kind: 'ACCOUNT_RESTORED', locale: 'en' }).subject).toBe('[PLAIN] Your account is no longer suspended');
    expect(accountMail({ ...base, kind: 'POINTS_GRANTED', points: 500 }, { subject: '{points}P 선물' }).subject).toBe('500P 선물');
  });

  it('사유에 섞인 태그는 글자로 나간다', () => {
    expect(accountMail({ ...base, kind: 'ACCOUNT_SUSPENDED', reason: '<img src=x>' }).html).not.toContain('<img');
  });
});

describe('notifyPointsAdjusted', () => {
  const adjusted = { userId: 'u-1', direction: 'GRANT' as const, amount: 12_000, note: '보상', balance: 20_000, expiresAt: new Date('2027-01-01') };

  it('메일과 알림함 — 알림의 포인트는 쉼표를 넣어 굳힌다', async () => {
    await notifyPointsAdjusted(adjusted);
    expect(send.mock.calls[0]![0].subject).toContain('12,000P');
    expect(recordNotification).toHaveBeenCalledWith({ userId: 'u-1', kind: 'POINTS_GRANTED', params: { points: '12,000' }, linkPath: '/mypage/points' });
  });

  it('차감은 차감 알림으로, 탈퇴한 계정에는 아무것도', async () => {
    await notifyPointsAdjusted({ ...adjusted, direction: 'DEDUCT', expiresAt: null });
    expect(recordNotification.mock.calls[0]![0].kind).toBe('POINTS_DEDUCTED');
    vi.clearAllMocks();
    db.user.findUnique.mockResolvedValue({ email: 'x', name: 'x', locale: null, deletedAt: new Date() });
    await notifyPointsAdjusted(adjusted);
    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).not.toHaveBeenCalled();
  });
});

describe('notifySuspension', () => {
  it('정지는 메일만 — 정지된 사람은 알림함을 못 연다', async () => {
    await notifySuspension({ userId: 'u-1', action: 'SUSPEND', reason: '결제 도용 의심' });
    expect(send.mock.calls[0]![0].text).toContain('결제 도용 의심');
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('해제는 메일과 알림함', async () => {
    await notifySuspension({ userId: 'u-1', action: 'RESTORE' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(recordNotification).toHaveBeenCalledWith({ userId: 'u-1', kind: 'ACCOUNT_RESTORED', params: {}, linkPath: '/mypage' });
  });

  it('조회가 터져도 던지지 않는다 — 정지는 이미 됐다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.user.findUnique.mockRejectedValue(new Error('db'));
    await expect(notifySuspension({ userId: 'u-1', action: 'SUSPEND', reason: 'x' })).resolves.toBeUndefined();
    error.mockRestore();
  });
});
