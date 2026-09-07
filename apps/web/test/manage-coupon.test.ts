import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  coupon: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
  userCoupon: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  $executeRaw: vi.fn<(...a: any[]) => any>(),
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: class extends Error { code = ''; } },
}));

const {
  createCoupon, updateCoupon, issueCouponToUser, claimCouponByCode,
} = await import('~/lib/admin/manage-coupon');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const now = new Date('2026-09-15T00:00:00+09:00');
const input = (over: Record<string, unknown> = {}) => ({
  code: 'welcome-10',
  name: '신규 가입 쿠폰',
  kind: 'AMOUNT' as const,
  value: 5000,
  percent: 0,
  maxDiscount: null,
  minimumOrder: 30_000,
  issueLimit: 100,
  startsAt: '2026-09-01T00:00:00+09:00',
  endsAt: '2026-09-30T23:59:59+09:00',
  targets: [] as { targetType: 'PRODUCT' | 'BRAND' | 'CATEGORY'; targetId: string }[],
  ...over,
});

const coupon = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', code: 'WELCOME10', name: '신규 가입 쿠폰', isActive: true,
  startsAt: new Date('2026-09-01T00:00:00+09:00'),
  endsAt: new Date('2026-09-30T23:59:59+09:00'),
  issueLimit: 100, issuedCount: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.coupon.create.mockImplementation(({ data }: any) => Promise.resolve({ ...coupon(), ...data }));
  db.coupon.findUnique.mockResolvedValue(coupon());
  db.userCoupon.findUnique.mockResolvedValue(null);
  db.userCoupon.create.mockResolvedValue({ id: 'uc-1' });
  db.$executeRaw.mockResolvedValue(1);
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('권한', () => {
  it('가맹점은 쿠폰을 만들 수 없다 — 플랫폼 비용이다', async () => {
    await expect(createCoupon(merchant, input())).rejects.toThrow();
    expect(db.coupon.create).not.toHaveBeenCalled();
  });
});

describe('발행 내용', () => {
  it('코드를 한 모양으로 맞춰 저장한다', async () => {
    await createCoupon(admin, input());

    expect(db.coupon.create.mock.calls[0]?.[0].data).toMatchObject({ code: 'WELCOME10' });
  });

  it('할인 금액이 최소 주문 금액보다 크면 막는다 — 그 순간 전 상품이 공짜다', async () => {
    await expect(
      createCoupon(admin, input({ value: 50_000, minimumOrder: 30_000 })),
    ).rejects.toMatchObject({ code: 'INVALID_COUPON' });
    expect(db.coupon.create).not.toHaveBeenCalled();
  });

  it('정률이면 value 를 저장하지 않는다', async () => {
    await createCoupon(admin, input({ kind: 'PERCENT', percent: 20, value: 9999, maxDiscount: 10_000 }));

    expect(db.coupon.create.mock.calls[0]?.[0].data).toMatchObject({
      kind: 'PERCENT', percent: 20, value: 0, maxDiscount: 10_000,
    });
  });

  it('대상을 지정하면 함께 저장한다', async () => {
    await createCoupon(admin, input({
      targets: [{ targetType: 'PRODUCT', targetId: 'p-tee' }],
    }));

    expect(db.coupon.create.mock.calls[0]?.[0].data.targets).toMatchObject({
      createMany: { data: [{ targetType: 'PRODUCT', targetId: 'p-tee' }] },
    });
  });

  it('대상이 없으면 행을 만들지 않는다 — 장바구니 전체라는 뜻이다', async () => {
    await createCoupon(admin, input());

    expect(db.coupon.create.mock.calls[0]?.[0].data.targets).toBeUndefined();
  });

  it('정액이면 percent·maxDiscount 를 저장하지 않는다', async () => {
    await createCoupon(admin, input({ percent: 30, maxDiscount: 5000 }));

    expect(db.coupon.create.mock.calls[0]?.[0].data).toMatchObject({
      percent: 0, maxDiscount: null,
    });
  });
});

describe('발급 수량', () => {
  it('조건과 증가를 한 문장으로 보낸다 — 읽고 세고 쓰면 동시에 마지막 한 장을 집는다', async () => {
    await issueCouponToUser('c-1', 'u-1', now);

    // Prisma 의 where 는 같은 행의 다른 컬럼을 못 비교해서 SQL 로 간다.
    const sql = db.$executeRaw.mock.calls[0]?.[0].join('');
    expect(sql).toContain('issuedCount');
    expect(sql).toContain('issueLimit');
  });

  it('그 사이 마지막 한 장이 나갔으면 0건이 나오고 거절한다', async () => {
    db.$executeRaw.mockResolvedValue(0);

    await expect(issueCouponToUser('c-1', 'u-1', now)).rejects.toMatchObject({
      code: 'EXHAUSTED',
    });
    expect(db.userCoupon.create).not.toHaveBeenCalled();
  });

  it('이미 소진된 쿠폰은 SQL 을 보내기도 전에 막는다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ issuedCount: 100 }));

    await expect(issueCouponToUser('c-1', 'u-1', now)).rejects.toMatchObject({
      code: 'EXHAUSTED',
    });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('같은 사람이 두 번 받지 못한다', async () => {
    db.userCoupon.findUnique.mockResolvedValue({ id: 'uc-1' });

    await expect(issueCouponToUser('c-1', 'u-1', now)).rejects.toMatchObject({
      code: 'ALREADY_ISSUED',
    });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('자기가 마지막 한 장을 가졌으면 "소진" 이 아니라 "이미 받음" 이다', async () => {
    // 순서가 반대면 놓친 줄 알고 만다. 실제로 그렇게 답하고 있었다.
    db.coupon.findUnique.mockResolvedValue(coupon({ issueLimit: 1, issuedCount: 1 }));
    db.userCoupon.findUnique.mockResolvedValue({ id: 'uc-1' });

    await expect(issueCouponToUser('c-1', 'u-1', now)).rejects.toMatchObject({
      code: 'ALREADY_ISSUED',
    });
  });

  it('중지된 쿠폰은 발급하지 않는다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ isActive: false }));

    await expect(issueCouponToUser('c-1', 'u-1', now)).rejects.toMatchObject({
      code: 'INACTIVE',
    });
  });

  it('기간이 지났으면 발급하지 않는다', async () => {
    const late = new Date('2026-10-05T00:00:00+09:00');

    await expect(issueCouponToUser('c-1', 'u-1', late)).rejects.toMatchObject({
      code: 'EXPIRED',
    });
  });

  it('만료일은 쿠폰 종료일을 따른다', async () => {
    await issueCouponToUser('c-1', 'u-1', now);

    expect(db.userCoupon.create.mock.calls[0]?.[0].data).toMatchObject({
      expiresAt: coupon().endsAt,
    });
  });
});

describe('코드로 직접 받기', () => {
  it('코드를 한 모양으로 맞춰 찾는다', async () => {
    db.coupon.findUnique.mockResolvedValueOnce({ id: 'c-1' }).mockResolvedValue(coupon());

    await claimCouponByCode(' welcome-10 ', 'u-1', now);

    expect(db.coupon.findUnique.mock.calls[0]?.[0].where).toEqual({ code: 'WELCOME10' });
  });

  it('없는 코드와 못 받는 코드를 같은 말로 거절한다', async () => {
    // 구분해 주면 무작위로 넣어 보며 어떤 코드가 있는지 알아낼 수 있다
    db.coupon.findUnique.mockResolvedValue(null);

    await expect(claimCouponByCode('AAAAAA', 'u-1', now)).rejects.toMatchObject({
      message: '사용할 수 없는 코드입니다.',
    });
  });
});

describe('수정', () => {
  it('발급된 쿠폰의 기간은 줄일 수 없다 — 아직 안 쓴 사람의 쿠폰이 사라진다', async () => {
    db.coupon.findUnique.mockResolvedValue({
      id: 'c-1', issuedCount: 12, endsAt: new Date('2026-09-30T23:59:59+09:00'),
    });

    await expect(
      updateCoupon(admin, 'c-1', { endsAt: '2026-09-10T00:00:00+09:00' }),
    ).rejects.toMatchObject({ code: 'CANNOT_SHORTEN' });
    expect(db.coupon.update).not.toHaveBeenCalled();
  });

  it('늘리는 것은 된다', async () => {
    db.coupon.findUnique.mockResolvedValue({
      id: 'c-1', issuedCount: 12, endsAt: new Date('2026-09-30T23:59:59+09:00'),
    });
    db.coupon.update.mockResolvedValue({ ...coupon(), _count: { issued: 3 } });

    await updateCoupon(admin, 'c-1', { endsAt: '2026-10-31T23:59:59+09:00' });

    expect(db.coupon.update).toHaveBeenCalled();
  });

  it('한 장도 안 나갔으면 기간을 줄여도 된다', async () => {
    db.coupon.findUnique.mockResolvedValue({
      id: 'c-1', issuedCount: 0, endsAt: new Date('2026-09-30T23:59:59+09:00'),
    });
    db.coupon.update.mockResolvedValue({ ...coupon(), _count: { issued: 0 } });

    await updateCoupon(admin, 'c-1', { endsAt: '2026-09-10T00:00:00+09:00' });

    expect(db.coupon.update).toHaveBeenCalled();
  });

  it('중지해도 이미 받은 사람의 쿠폰은 지우지 않는다', async () => {
    db.coupon.findUnique.mockResolvedValue({
      id: 'c-1', issuedCount: 12, endsAt: new Date('2026-09-30T23:59:59+09:00'),
    });
    db.coupon.update.mockResolvedValue({ ...coupon({ isActive: false }), _count: { issued: 3 } });

    const r = await updateCoupon(admin, 'c-1', { isActive: false });

    // 중지는 '더 발급하지 않는다' 는 뜻이지 회수가 아니다
    expect(r.status).toBe('INACTIVE');
    expect(db.coupon.update.mock.calls[0]?.[0].data).toEqual({ isActive: false });
  });
});

/**
 * 기간을 줄이는 동안 누가 쿠폰을 받아 가면.
 *
 * "이미 발급된 쿠폰의 기간은 줄일 수 없다" 는 **읽은 시점의 발급 수**로
 * 판단한다. 0 이던 쿠폰을 누가 받아 가는 사이에 기간이 줄면, 방금 받은
 * 사람의 쿠폰이 뒤에서 짧아진다 — 받은 사람은 알 방법이 없다.
 */
describe('쿠폰 수정 — 그 사이에 발급되면', () => {
  it('줄일 때는 아직 아무도 안 받았다는 조건을 함께 건다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ issuedCount: 0 }));

    await updateCoupon(admin, 'c-1', { endsAt: '2026-09-10T00:00:00+09:00' });

    expect(db.coupon.update.mock.calls[0]?.[0].where).toMatchObject({
      id: 'c-1',
      issuedCount: 0,
    });
  });

  it('줄이는 것이 아니면 조건을 걸지 않는다', async () => {
    /*
     * 이름만 고칠 때까지 조건을 걸면, 그 순간 누가 쿠폰을 받았다는 이유로
     * 멀쩡한 수정이 실패한다. 막아야 하는 것은 줄이는 것뿐이다.
     */
    db.coupon.findUnique.mockResolvedValue(coupon({ issuedCount: 0 }));

    await updateCoupon(admin, 'c-1', { name: '이름만 바꾼다' });

    expect(db.coupon.update.mock.calls[0]?.[0].where).toEqual({ id: 'c-1' });
  });

  it('늘리는 것은 이미 발급됐어도 막지 않는다', async () => {
    db.coupon.findUnique.mockResolvedValue(coupon({ issuedCount: 5 }));

    await updateCoupon(admin, 'c-1', { endsAt: '2026-10-31T23:59:59+09:00' });

    expect(db.coupon.update.mock.calls[0]?.[0].where).toEqual({ id: 'c-1' });
  });
});
