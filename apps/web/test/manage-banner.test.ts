import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  banner: {
    findMany: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  getLiveBanners, getAdminBanners, createBanner, updateBanner, deleteBanner, reorderBanners,
} = await import('~/lib/admin/manage-banner');
const { setStorage } = await import('~/lib/storage');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const NOW = new Date('2026-09-01T12:00:00Z');

const banner = (over: Record<string, unknown> = {}) => ({
  id: 'b-1', eyebrow: null, headline: '제목', subcopy: null,
  ctaLabel: null, href: null, imageUrl: null, imageAlt: null,
  tone: 'sand', sortOrder: 0, isActive: true, startsAt: null, endsAt: null,
  ...over,
});

const storage = { name: 'fake', put: vi.fn(), remove: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  setStorage(storage);
  db.banner.count.mockResolvedValue(0);
  db.$transaction.mockResolvedValue([]);
});
afterEach(() => setStorage(undefined));

describe('권한 — 배너는 플랫폼 진열이다', () => {
  it('가맹점은 목록도 볼 수 없다', async () => {
    // 남의 매대를 바꾸는 셈이 된다
    await expect(getAdminBanners(merchant)).rejects.toThrow();
  });

  it('고객도 볼 수 없다', async () => {
    await expect(getAdminBanners(customer)).rejects.toThrow();
  });

  it('가맹점은 만들 수 없다', async () => {
    await expect(createBanner(merchant, { headline: 'x' } as never)).rejects.toThrow();
    expect(db.banner.create).not.toHaveBeenCalled();
  });

  it('관리자는 볼 수 있다', async () => {
    db.banner.findMany.mockResolvedValue([banner()]);
    await expect(getAdminBanners(admin, NOW)).resolves.toHaveLength(1);
  });
});

describe('홈 노출 — 권한 없이 읽는다', () => {
  it('로그인하지 않은 방문자도 볼 수 있어야 한다', async () => {
    db.banner.findMany.mockResolvedValue([banner()]);
    await expect(getLiveBanners(NOW)).resolves.toHaveLength(1);
  });

  it('꺼 둔 배너는 거른다', async () => {
    db.banner.findMany.mockResolvedValue([banner({ isActive: false })]);
    expect(await getLiveBanners(NOW)).toHaveLength(0);
  });

  it('시작 전 배너는 거른다', async () => {
    db.banner.findMany.mockResolvedValue([
      banner({ id: 'b-1', startsAt: new Date('2026-12-01T00:00:00Z') }),
      banner({ id: 'b-2' }),
    ]);
    const live = await getLiveBanners(NOW);
    expect(live.map((b) => b.id)).toEqual(['b-2']);
  });

  it('끝난 배너는 거른다', async () => {
    db.banner.findMany.mockResolvedValue([banner({ endsAt: new Date('2026-01-01T00:00:00Z') })]);
    expect(await getLiveBanners(NOW)).toHaveLength(0);
  });

  it('정렬 순서대로 준다', async () => {
    db.banner.findMany.mockResolvedValue([banner()]);
    await getLiveBanners(NOW);
    expect(db.banner.findMany.mock.calls[0]?.[0].orderBy).toEqual({ sortOrder: 'asc' });
  });
});

describe('어드민 목록', () => {
  it('꺼져 있거나 끝난 것도 보여 준다 — 안 보이면 고칠 수 없다', async () => {
    db.banner.findMany.mockResolvedValue([
      banner({ id: 'b-1', isActive: false }),
      banner({ id: 'b-2', endsAt: new Date('2026-01-01T00:00:00Z') }),
      banner({ id: 'b-3', startsAt: new Date('2026-12-01T00:00:00Z') }),
      banner({ id: 'b-4' }),
    ]);
    const rows = await getAdminBanners(admin, NOW);
    expect(rows.map((r) => r.status)).toEqual(['PAUSED', 'ENDED', 'SCHEDULED', 'LIVE']);
  });
});

describe('등록', () => {
  beforeEach(() => {
    db.banner.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(banner(data)));
  });

  it('맨 뒤에 붙인다', async () => {
    db.banner.count.mockResolvedValue(3);
    await createBanner(admin, { headline: '새 배너' } as never);
    expect(db.banner.create.mock.calls[0]?.[0].data.sortOrder).toBe(3);
  });

  it('6개를 넘기면 거절한다 — 아무도 끝까지 보지 않는다', async () => {
    db.banner.count.mockResolvedValue(6);
    await expect(createBanner(admin, { headline: 'x' } as never)).rejects.toMatchObject({
      code: 'TOO_MANY_BANNERS', status: 409,
    });
    expect(db.banner.create).not.toHaveBeenCalled();
  });
});

describe('수정', () => {
  beforeEach(() => {
    db.banner.findUnique.mockResolvedValue(banner({ subcopy: '원래 설명' }));
    db.banner.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(banner({ subcopy: '원래 설명', ...data })));
  });

  it('보내지 않은 필드는 UPDATE 문에 싣지 않는다', async () => {
    await updateBanner(admin, 'b-1', { headline: '새 제목', subcopy: undefined } as never);
    expect(Object.keys(db.banner.update.mock.calls[0]?.[0].data)).toEqual(['headline']);
  });

  it('명시적 null 은 그대로 실어 보낸다 — 지우려는 뜻이다', async () => {
    await updateBanner(admin, 'b-1', { subcopy: null } as never);
    expect(db.banner.update.mock.calls[0]?.[0].data).toEqual({ subcopy: null });
  });

  it('없는 배너는 404', async () => {
    db.banner.findUnique.mockResolvedValue(null);
    await expect(updateBanner(admin, 'b-x', { headline: 'x' } as never)).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND', status: 404,
    });
  });
});

describe('삭제', () => {
  it('저장소 객체도 지운다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: 'products/banner-b-1/x.png' });
    db.banner.delete.mockResolvedValue({});
    db.banner.findMany.mockResolvedValue([]);
    await deleteBanner(admin, 'b-1');
    expect(storage.remove).toHaveBeenCalledWith('products/banner-b-1/x.png');
  });

  it('저장소 삭제가 실패해도 화면에서는 사라진다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: 'k' });
    db.banner.delete.mockResolvedValue({});
    db.banner.findMany.mockResolvedValue([]);
    storage.remove.mockRejectedValue(new Error('네트워크'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deleteBanner(admin, 'b-1')).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('가맹점은 삭제할 수 없다', async () => {
    await expect(deleteBanner(merchant, 'b-1')).rejects.toThrow();
    expect(db.banner.delete).not.toHaveBeenCalled();
  });
});

describe('순서 변경', () => {
  it('일부만 보내면 거절한다', async () => {
    db.banner.findMany.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }]);
    await expect(reorderBanners(admin, ['b-1', 'b-2'])).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND',
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('없는 id 를 섞으면 거절한다', async () => {
    db.banner.findMany.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }]);
    await expect(reorderBanners(admin, ['b-1', 'b-9'])).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND',
    });
  });
});
