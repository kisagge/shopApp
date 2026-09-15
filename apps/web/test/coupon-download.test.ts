import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 쿠폰 받기 — 공개한 쿠폰만 목록에·창구에, 상품 화면에는 그 상품에 쓰이는 것만, 받은 표시.
 */

const db = vi.hoisted(() => ({
  coupon: { findMany: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));
const issueCouponToUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-coupon', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/manage-coupon')>()),
  issueCouponToUser,
}));
const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { listDownloadableCoupons, downloadCoupon } = await import('~/lib/coupons/downloadable');
const { CouponError } = await import('~/lib/admin/manage-coupon');
const { POST } = await import('~/app/api/coupons/[id]/download/route');

const NOW = new Date('2026-09-15T00:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', name: '가을 20%', kind: 'PERCENT', value: 0, percent: 20, maxDiscount: 30_000, minimumOrder: 50_000,
  startsAt: new Date('2026-09-01'), endsAt: new Date('2026-09-30'), isActive: true, downloadable: true,
  issueLimit: 100, issuedCount: 40, targets: [], ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.coupon.findMany.mockResolvedValue([row()]);
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  enforceRateLimit.mockResolvedValue(null);
});

describe('listDownloadableCoupons', () => {
  it('공개했고 기간 안인 것을 기한이 가까운 순으로 묻고, 남은 수량을 붙인다', async () => {
    const list = await listDownloadableCoupons({}, NOW);
    const q = db.coupon.findMany.mock.calls[0]?.[0];
    expect(q.where).toEqual({ downloadable: true, isActive: true, startsAt: { lte: NOW }, endsAt: { gt: NOW } });
    expect(q.orderBy).toEqual([{ endsAt: 'asc' }, { id: 'asc' }]);
    expect(q.select).not.toHaveProperty('issued');
    expect(list[0]).toMatchObject({ id: 'c-1', remaining: 60, limited: false, claimed: false });
  });

  it('수량이 다 나간 쿠폰은 뺀다(같은 행의 두 칸 비교라 조회가 못 거른다)', async () => {
    db.coupon.findMany.mockResolvedValue([row({ issueLimit: 5, issuedCount: 5 })]);
    expect(await listDownloadableCoupons({}, NOW)).toEqual([]);
  });

  it('로그인했으면 받았는지 붙인다', async () => {
    db.coupon.findMany.mockResolvedValue([row({ issued: [{ id: 'uc-1' }] }), row({ id: 'c-2', issued: [] })]);
    const list = await listDownloadableCoupons({ userId: 'u-1' }, NOW);
    expect(db.coupon.findMany.mock.calls[0]?.[0].select.issued).toEqual({ where: { userId: 'u-1' }, select: { id: true } });
    expect(list.map((c) => c.claimed)).toEqual([true, false]);
  });

  it('상품 화면에는 그 상품에 쓰이는 것만 — 대상이 정해진 쿠폰은 "일부 상품"', async () => {
    db.coupon.findMany.mockResolvedValue([
      row({ id: 'all' }),
      row({ id: 'brand', targets: [{ targetType: 'BRAND', targetId: 'b-1' }] }),
      row({ id: 'other', targets: [{ targetType: 'PRODUCT', targetId: 'p-9' }] }),
    ]);
    const list = await listDownloadableCoupons({ product: { id: 'p-1', brandId: 'b-1', categoryId: 'c-1' } }, NOW);
    expect(list.map((c) => [c.id, c.limited])).toEqual([['all', false], ['brand', true]]);
  });
});

describe('downloadCoupon', () => {
  it('공개한 쿠폰이면 코드 입력과 같은 발급 함수로 준다', async () => {
    db.coupon.findUnique.mockResolvedValue({ downloadable: true });
    issueCouponToUser.mockResolvedValue({ code: 'AUTUMN20', name: '가을 20%', expiresAt: NOW });
    await downloadCoupon('c-1', 'u-1', NOW);
    expect(issueCouponToUser).toHaveBeenCalledWith('c-1', 'u-1', NOW);
  });

  it('공개하지 않은 쿠폰은 id 를 알아도 없는 쿠폰이다', async () => {
    db.coupon.findUnique.mockResolvedValue({ downloadable: false });
    await expect(downloadCoupon('c-secret', 'u-1', NOW)).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    db.coupon.findUnique.mockResolvedValue(null);
    await expect(downloadCoupon('nope', 'u-1', NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(issueCouponToUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/coupons/[id]/download', () => {
  const call = () => POST(new Request('http://localhost/api/coupons/c-1/download', { method: 'POST' }), { params: Promise.resolve({ id: 'c-1' }) });

  it('받으면 201, 로그인 안 했으면 401, 요청 제한에 걸리면 그대로', async () => {
    db.coupon.findUnique.mockResolvedValue({ downloadable: true });
    issueCouponToUser.mockResolvedValue({ code: 'AUTUMN20', name: '가을 20%', expiresAt: NOW });
    expect((await call()).status).toBe(201);
    getSessionUser.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    enforceRateLimit.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
  });

  it('이미 받았으면 코드와 함께 409 — 화면이 받은 것으로 맞춘다', async () => {
    db.coupon.findUnique.mockResolvedValue({ downloadable: true });
    issueCouponToUser.mockRejectedValue(new CouponError('ALREADY_ISSUED', '이미 받은 쿠폰입니다.', 409));
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'ALREADY_ISSUED' });
  });
});
