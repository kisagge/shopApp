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
  // 대상 이름을 붙이려고 세 표를 읽는다
  product: { findMany: vi.fn<(...a: any[]) => any>() },
  brand: { findMany: vi.fn<(...a: any[]) => any>() },
  category: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { PrismaClientKnownRequestError: class extends Error { code = ''; } },
}));

const {
  createCoupon, updateCoupon, issueCouponToUser, claimCouponByCode, listCoupons,
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
  downloadable: false,
  ...over,
});

const coupon = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', code: 'WELCOME10', name: '신규 가입 쿠폰', isActive: true,
  startsAt: new Date('2026-09-01T00:00:00+09:00'),
  endsAt: new Date('2026-09-30T23:59:59+09:00'),
  issueLimit: 100, issuedCount: 0,
  // 조회가 늘 함께 읽어 온다(대상 이름을 붙여야 한다)
  targets: [],
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
  db.product.findMany.mockResolvedValue([]);
  db.brand.findMany.mockResolvedValue([]);
  db.category.findMany.mockResolvedValue([]);
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

/**
 * 목록의 **대상 칸** — "지정 3개" 만 적혀 있었다.
 *
 * 대상은 만들 때만 정하고 다시 열어 볼 화면이 없다. 그래서 상위 분류에 걸어 **어떤 상품에도 붙지
 * 않는** 쿠폰(커밋 40d51fd 가 막은 그 쿠폰)이 이미 섞여 있어도 목록에서는 멀쩡한 쿠폰과 구별되지
 * 않는다. 손님은 "쓸 수 없습니다" 만 보고, 운영은 까닭을 모른다 — 이름과 경고를 함께 적는다.
 */
describe('쿠폰 목록의 대상', () => {
  const row = (targets: { targetType: string; targetId: string }[]) => ({
    ...coupon(),
    kind: 'AMOUNT', value: 5000, percent: 0, maxDiscount: null, minimumOrder: 0,
    downloadable: false,
    _count: { issued: 0, targets: targets.length },
    targets,
  });

  it('id 대신 이름을 적는다', async () => {
    db.coupon.findMany.mockResolvedValue([
      row([
        { targetType: 'PRODUCT', targetId: 'p-1' },
        { targetType: 'BRAND', targetId: 'b-1' },
        { targetType: 'CATEGORY', targetId: 'c-coat' },
      ]),
    ]);
    db.product.findMany.mockResolvedValue([{ id: 'p-1', name: '울 코트' }]);
    db.brand.findMany.mockResolvedValue([{ id: 'b-1', name: 'MOOR' }]);
    db.category.findMany.mockResolvedValue([{ id: 'c-coat', name: '코트', _count: { children: 0 } }]);

    const [got] = await listCoupons(admin, now);

    expect(got!.targetNames).toEqual(['울 코트', 'MOOR', '코트']);
    expect(got!.deadTargets).toBe(false);
  });

  it('상위 분류가 걸려 있으면 붙는 상품이 없다고 짚는다', async () => {
    db.coupon.findMany.mockResolvedValue([row([{ targetType: 'CATEGORY', targetId: 'c-outer' }])]);
    db.category.findMany.mockResolvedValue([
      { id: 'c-outer', name: '아우터', _count: { children: 3 } },
    ]);

    const [got] = await listCoupons(admin, now);

    expect(got!.targetNames).toEqual(['아우터']);
    expect(got!.deadTargets).toBe(true);
  });

  it('사라진 대상도 자리를 지킨다 — 수와 이름이 어긋나면 안 된다', async () => {
    db.coupon.findMany.mockResolvedValue([
      row([
        { targetType: 'PRODUCT', targetId: 'p-1' },
        { targetType: 'PRODUCT', targetId: 'p-gone' },
      ]),
    ]);
    db.product.findMany.mockResolvedValue([{ id: 'p-1', name: '울 코트' }]);

    const [got] = await listCoupons(admin, now);

    expect(got!.targetNames).toHaveLength(2);
    expect(got!.targetNames[1]).toBe('(알 수 없음)');
    expect(got!.targetCount).toBe(2);
  });

  /** 쿠폰마다 세 번씩 묻지 않는다 — 목록은 한 화면에 수십 줄이다 */
  it('대상이 많아도 표는 세 번만 읽는다', async () => {
    db.coupon.findMany.mockResolvedValue([
      row([{ targetType: 'PRODUCT', targetId: 'p-1' }]),
      row([{ targetType: 'PRODUCT', targetId: 'p-2' }]),
      row([{ targetType: 'CATEGORY', targetId: 'c-coat' }]),
    ]);

    await listCoupons(admin, now);

    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.brand.findMany).toHaveBeenCalledTimes(1);
    expect(db.category.findMany).toHaveBeenCalledTimes(1);
    // 한 번에 다 묻는다
    expect(db.product.findMany.mock.calls[0]![0].where).toEqual({ id: { in: ['p-1', 'p-2'] } });
  });

  it('전체 쿠폰만 있으면 아무것도 묻지 않는다', async () => {
    db.coupon.findMany.mockResolvedValue([row([])]);

    const [got] = await listCoupons(admin, now);

    expect(got!.targetNames).toEqual([]);
    expect(db.product.findMany).not.toHaveBeenCalled();
    expect(db.category.findMany).not.toHaveBeenCalled();
  });

  /**
   * 만들고·고친 줄은 목록을 다시 읽지 않고 **그 자리에 끼워진다**(화면이 돌려받은 줄을 세운다).
   * 그래서 세 자리가 같은 모양을 내놔야 한다 — 하나라도 빠뜨리면 그 줄만 대상 칸이 빈다.
   */
  it('만든 직후 돌려주는 줄에도 대상 설명이 있다', async () => {
    db.category.findMany.mockResolvedValue([
      { id: 'c-outer', name: '아우터', _count: { children: 3 } },
    ]);

    const created = await createCoupon(
      admin,
      input({ targets: [{ targetType: 'CATEGORY', targetId: 'c-outer' }] }),
    );

    expect(created.targetNames).toEqual(['아우터']);
    expect(created.deadTargets).toBe(true);
  });

  it('고친 뒤 돌려주는 줄에도 대상 설명이 있다', async () => {
    db.coupon.update.mockResolvedValue({
      ...row([{ targetType: 'BRAND', targetId: 'b-1' }]),
    });
    db.brand.findMany.mockResolvedValue([{ id: 'b-1', name: 'MOOR' }]);

    const updated = await updateCoupon(admin, 'c-1', { name: '이름만 고친다' });

    expect(updated.targetNames).toEqual(['MOOR']);
    expect(updated.deadTargets).toBe(false);
  });
});
