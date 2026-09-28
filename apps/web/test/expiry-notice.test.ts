import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 곧 사라질 쿠폰·적립금 알림 — 사람마다 한 통, 표시를 먼저, 한 번만, 쓴 몫은 빼고.
 */

const db = vi.hoisted(() => ({
  userCoupon: { findMany: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findMany: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  mailTemplate: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ name: 'fake', send }) }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const { sendExpiryNotices, expiringCouponMail, expiringPointsMail } = await import('~/lib/notifications/expiry-notice');
const { GET } = await import('~/app/api/cron/expiry-notices/route');

const NOW = new Date('2026-09-15T01:00:00Z');
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000);
/** 마케팅 수신에 동의해 둔 사람 — 소멸 안내는 그 동의가 있어야 나간다 */
const KIM = {
  email: 'kim@plain.test', name: '김손님', locale: 'ko',
  marketingAgreedAt: new Date('2026-01-01T00:00:00Z'),
};
/** 수신을 꺼 둔 사람 */
const OPTED_OUT = { ...KIM, marketingAgreedAt: null };

const coupon = (id: string, userId: string, days: number, name = '가을 쿠폰') => ({
  id, userId, expiresAt: inDays(days), coupon: { name }, user: KIM,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.userCoupon.findMany.mockResolvedValue([]);
  db.userCoupon.updateMany.mockResolvedValue({ count: 1 });
  db.pointTransaction.findMany.mockResolvedValue([]);
  db.pointTransaction.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue(KIM);
  db.mailTemplate.findUnique.mockResolvedValue(null);
  send.mockResolvedValue(undefined);
});

describe('쿠폰', () => {
  it('7일 안에 기한이 끝나는, 안 쓴·안 알린·살아 있는 쿠폰만 찾는다', async () => {
    await sendExpiryNotices(NOW);
    expect(db.userCoupon.findMany.mock.calls[0]?.[0].where).toEqual({
      usedAt: null, expiryNoticeAt: null, expiresAt: { gt: NOW, lte: inDays(7) },
      coupon: { isActive: true }, user: { deletedAt: null },
    });
  });

  it('사람마다 한 통 — 쿠폰마다 이름과 기한, 알림에는 장수와 가장 빠른 날', async () => {
    db.userCoupon.findMany.mockResolvedValue([coupon('c-1', 'u-1', 2, 'A 쿠폰'), coupon('c-2', 'u-1', 5, 'B 쿠폰'), coupon('c-3', 'u-2', 6)]);
    const r = await sendExpiryNotices(NOW);
    expect(r).toMatchObject({ couponUsers: 2, coupons: 3 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0].text).toContain('A 쿠폰 · 2026-09-17까지');
    expect(recordNotification.mock.calls[0]![0]).toEqual({
      userId: 'u-1', kind: 'COUPON_EXPIRING', params: { count: '2', date: '2026-09-17' }, linkPath: '/mypage/coupons',
    });
  });

  it('보내기 전에 표시한다 — 다른 실행이 먼저 표시했으면 보내지 않는다', async () => {
    const order: string[] = [];
    db.userCoupon.findMany.mockResolvedValue([coupon('c-1', 'u-1', 2)]);
    db.userCoupon.updateMany.mockImplementation(() => { order.push('mark'); return Promise.resolve({ count: 1 }); });
    send.mockImplementation(() => { order.push('send'); return Promise.resolve(); });
    await sendExpiryNotices(NOW);
    expect(order).toEqual(['mark', 'send']);
    expect(db.userCoupon.updateMany.mock.calls[0]?.[0]).toEqual({ where: { id: { in: ['c-1'] }, expiryNoticeAt: null }, data: { expiryNoticeAt: NOW } });

    vi.clearAllMocks();
    db.userCoupon.findMany.mockResolvedValue([coupon('c-1', 'u-1', 2)]);
    db.userCoupon.updateMany.mockResolvedValue({ count: 0 });
    db.pointTransaction.findMany.mockResolvedValue([]);
    await sendExpiryNotices(NOW);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('적립금', () => {
  it('쓴 몫을 빼고 날마다 얼마가 사라지는지 — 한 통, 알린 적립에 표시', async () => {
    db.pointTransaction.findMany
      .mockResolvedValueOnce([{ userId: 'u-1' }])
      .mockResolvedValueOnce([
        { amount: 3000, createdAt: new Date('2026-01-01'), expiresAt: inDays(3) },
        { amount: 2000, createdAt: new Date('2026-01-02'), expiresAt: inDays(5) },
        { amount: -1000, createdAt: new Date('2026-02-01'), expiresAt: null },
      ]);
    const r = await sendExpiryNotices(NOW);
    expect(r).toMatchObject({ pointUsers: 1, points: 4000 });
    expect(db.pointTransaction.updateMany.mock.calls[0]?.[0]).toEqual({
      where: { userId: 'u-1', amount: { gt: 0 }, expiryNoticeAt: null, expiresAt: { gt: NOW, lte: inDays(7) } },
      data: { expiryNoticeAt: NOW },
    });
    expect(send.mock.calls[0]![0].subject).toBe('[PLAIN] 적립금 4,000P가 곧 사라집니다');
    expect(send.mock.calls[0]![0].text).toContain('2026-09-18 · 2,000P');
    expect(recordNotification.mock.calls[0]![0]).toMatchObject({ kind: 'POINTS_EXPIRING', params: { points: '4,000', date: '2026-09-18' } });
  });

  it('이미 다 써서 사라질 것이 없으면 표시만 하고 알리지 않는다 — 매일 다시 계산하지 않게', async () => {
    db.pointTransaction.findMany
      .mockResolvedValueOnce([{ userId: 'u-1' }])
      .mockResolvedValueOnce([
        { amount: 1000, createdAt: new Date('2026-01-01'), expiresAt: inDays(3) },
        { amount: -1000, createdAt: new Date('2026-02-01'), expiresAt: null },
      ]);
    await sendExpiryNotices(NOW);
    expect(db.pointTransaction.updateMany).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).not.toHaveBeenCalled();
  });
});

describe('메일', () => {
  it('받는 사람의 말로, 고친 문구로', () => {
    expect(expiringCouponMail({ to: 'a', name: 'Kim', locale: 'en', coupons: [{ name: 'Fall', date: '2026-09-20' }] }).subject).toBe('[PLAIN] 1 coupon expires soon');
    expect(expiringPointsMail({ to: 'a', name: '김', locale: 'ko', amount: 500, days: [{ date: '2026-09-20', amount: 500 }] }, { subject: '{points}P 곧 사라져요' }).subject).toBe('500P 곧 사라져요');
  });
});

describe('GET /api/cron/expiry-notices', () => {
  it('비밀 없이는 돌지 않는다', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await GET(new Request('http://localhost/api/cron/expiry-notices'));
    expect(res.status).toBe(401);
    expect(db.userCoupon.findMany).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('알린 날만 감사 로그에 남긴다', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const call = () => GET(new Request('http://localhost/api/cron/expiry-notices', { headers: { authorization: 'Bearer s3cret' } }));
    await call();
    expect(recordAudit).not.toHaveBeenCalled();
    db.userCoupon.findMany.mockResolvedValue([coupon('c-1', 'u-1', 2)]);
    await call();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'notices.expiry' });
    vi.unstubAllEnvs();
  });
});

/**
 * **꺼 둔 스위치가 지켜지는가.**
 *
 * 마이페이지에는 마케팅 수신 스위치가 있는데 끄든 켜든 아무것도 달라지지 않았다 — 판단 함수까지 만들어
 * 두고 부르는 곳이 없었다. 꺼 둔 사람에게도 소멸 안내가 그대로 나갔고, 끈 것이 지켜지지 않으면 손님은
 * 그 스위치를 다시 믿지 않는다.
 *
 * **알림함에는 남긴다.** 수신 거부는 메일을 그만 받겠다는 것이지, 자기 쿠폰이 언제 사라지는지 몰라도
 * 좋다는 뜻이 아니다 — 다시 들어온 사람은 볼 수 있어야 한다.
 */
describe('마케팅 수신 거부', () => {
  it('꺼 둔 사람에게는 쿠폰 소멸 메일을 보내지 않는다', async () => {
    db.userCoupon.findMany.mockResolvedValue([
      { ...coupon('uc-1', 'u-1', 3), user: OPTED_OUT },
    ]);

    await sendExpiryNotices(NOW);

    expect(send, '수신을 껐는데 메일이 나갔다').not.toHaveBeenCalled();
  });

  it('그래도 알림함에는 남긴다 — 자기 쿠폰이 사라지는 것은 알아야 한다', async () => {
    db.userCoupon.findMany.mockResolvedValue([
      { ...coupon('uc-1', 'u-1', 3), user: OPTED_OUT },
    ]);

    await sendExpiryNotices(NOW);

    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', kind: 'COUPON_EXPIRING' }),
    );
  });

  it('켜 둔 사람에게는 그대로 간다', async () => {
    db.userCoupon.findMany.mockResolvedValue([coupon('uc-1', 'u-1', 3)]);

    await sendExpiryNotices(NOW);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('적립금 소멸도 같다', async () => {
    db.pointTransaction.findMany
      .mockResolvedValueOnce([{ userId: 'u-1' }])
      .mockResolvedValue([{ amount: 1000, createdAt: inDays(-300), expiresAt: inDays(3) }]);
    db.user.findUnique.mockResolvedValue(OPTED_OUT);

    await sendExpiryNotices(NOW);

    expect(send).not.toHaveBeenCalled();
    expect(recordNotification).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'POINTS_EXPIRING' }),
    );
  });
});
