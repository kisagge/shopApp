import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
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
  setBannerImage,
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

const storage = {
  name: 'fake',
  put: vi.fn(async ({ key }: { key: string }) => ({ url: `https://cdn.test/${key}` })),
  remove: vi.fn(async () => {}),
};

/** 진짜 사진. 만들어 낸 헤더로는 다듬기가 되지 않는다(image-replace 와 같은 까닭). */
const png = async () => ({
  bytes: new Uint8Array(
    await sharp({ create: { width: 40, height: 40, channels: 3, background: '#888' } })
      .png()
      .toBuffer(),
  ),
  declaredType: 'image/png',
});

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
    await updateBanner(admin, 'b-1', { headline: '새 제목', subcopy: undefined });
    expect(Object.keys(db.banner.update.mock.calls[0]?.[0].data)).toEqual(['headline']);
  });

  it('명시적 null 은 그대로 실어 보낸다 — 지우려는 뜻이다', async () => {
    await updateBanner(admin, 'b-1', { subcopy: null });
    expect(db.banner.update.mock.calls[0]?.[0].data).toEqual({ subcopy: null });
  });

  it('없는 배너는 404', async () => {
    db.banner.findUnique.mockResolvedValue(null);
    await expect(updateBanner(admin, 'b-x', { headline: 'x' })).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND', status: 404,
    });
  });
});

describe('삭제', () => {
  it('없는 배너를 지우려 하면 404 로 말한다 — 프리즈마가 터지면 운영자에게 500 이 나간다', async () => {
    db.banner.findUnique.mockResolvedValue(null);
    await expect(deleteBanner(admin, 'b-없음')).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND', status: 404,
    });
    expect(db.banner.delete).not.toHaveBeenCalled();
  });

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

describe('순서를 실제로 다시 적는 자리', () => {
  /*
   * **거절만 검사돼 있었다.** 일부만 보내거나 모르는 id 를 섞으면 튕기는 것은
   * 보고 있었는데, **받아들인 뒤 실제로 무엇을 쓰는지**는 한 줄도 안 돌았다 —
   * 순서는 눈에 보이는 결과라, 틀리면 운영자가 끌어다 놓은 대로 안 남는다.
   */
  it('받은 순서대로 0부터 다시 적는다', async () => {
    db.banner.findMany.mockResolvedValue([{ id: 'b-1' }, { id: 'b-2' }, { id: 'b-3' }]);
    await reorderBanners(admin, ['b-3', 'b-1', 'b-2']);

    expect(db.banner.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.sortOrder])).toEqual([
      ['b-3', 0],
      ['b-1', 1],
      ['b-2', 2],
    ]);
    // 세 번의 쓰기가 한 트랜잭션이다 — 가운데서 끊기면 순서가 뒤섞인 채 남는다
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0]![0]).toHaveLength(3);
  });

  it('바꾼 뒤의 목록을 돌려준다 — 화면이 다시 묻지 않아도 된다', async () => {
    db.banner.findMany.mockResolvedValue([{ id: 'b-1' }]);
    db.banner.findMany.mockResolvedValueOnce([{ id: 'b-1' }]);
    db.banner.findMany.mockResolvedValueOnce([banner({ id: 'b-1', sortOrder: 0 })]);

    await expect(reorderBanners(admin, ['b-1'])).resolves.toMatchObject([{ id: 'b-1' }]);
  });

  it('가운데를 지우면 남은 것의 순서를 메운다 — 구멍이 남으면 다음 끌어놓기가 어긋난다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-2', storageKey: null });
    db.banner.delete.mockResolvedValue({});
    // 1번을 지운 뒤의 모습 — 0 과 2 가 남았다
    db.banner.findMany.mockResolvedValue([
      { id: 'b-1', sortOrder: 0 },
      { id: 'b-3', sortOrder: 2 },
    ]);

    await deleteBanner(admin, 'b-2');

    // 0 은 이미 맞으므로 쓰지 않는다 — 바뀐 줄만 쓴다
    expect(db.banner.update.mock.calls.map(([arg]) => [arg.where.id, arg.data.sortOrder])).toEqual([
      ['b-3', 1],
    ]);
  });
});

describe('배경 사진 교체', () => {
  /*
   * 갈아 끼우는 **순서**(올리기 → 적기 → 옛 것 지우기, 가운데서 실패하면 되돌리기)는
   * `image-replace` 가 네 화면 몫으로 한 번에 본다. 여기서 보는 것은 **배선**이다 —
   * 이 화면이 그 순서에 무엇을 넘기는가.
   */
  beforeEach(() => {
    db.banner.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(banner({ ...data })));
  });

  it('가맹점은 바꿀 수 없고 아무것도 올리지 않는다', async () => {
    await expect(setBannerImage(merchant, 'b-1', await png(), '대체 글')).rejects.toThrow();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('없는 배너면 404 고, 그때도 올리지 않는다 — 가리킬 데 없는 파일을 남기지 않는다', async () => {
    db.banner.findUnique.mockResolvedValue(null);
    await expect(setBannerImage(admin, 'b-x', await png(), '대체 글')).rejects.toMatchObject({
      code: 'BANNER_NOT_FOUND', status: 404,
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('키가 products/ 아래로 간다 — 버킷이 그 접두사만 공개한다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: null });
    await setBannerImage(admin, 'b-1', await png(), '대체 글');

    const key: string = storage.put.mock.calls[0]![0].key;
    expect(key.startsWith('products/banner-b-1/')).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
  });

  it('올린 자리와 흐린 미리보기, 다듬은 대체 글을 함께 적는다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: null });
    await setBannerImage(admin, 'b-1', await png(), '  가을 신상  ');

    const data = db.banner.update.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data.imageUrl).toBe(`https://cdn.test/${storage.put.mock.calls[0]![0].key}`);
    expect(data.storageKey).toBe(storage.put.mock.calls[0]![0].key);
    expect(String(data.blurDataUrl)).toMatch(/^data:image\//);
    expect(data.imageAlt).toBe('가을 신상');
  });

  it('대체 글이 공백뿐이면 비워 둔다 — 빈 글자를 적어 두면 지운 것과 구분이 안 된다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: null });
    await setBannerImage(admin, 'b-1', await png(), '   ');

    expect((db.banner.update.mock.calls[0]![0].data as Record<string, unknown>).imageAlt).toBeNull();
  });

  it('걸려 있던 파일은 지운다 — 바뀐 뒤에 아무도 안 가리킨다', async () => {
    db.banner.findUnique.mockResolvedValue({ id: 'b-1', storageKey: 'products/banner-b-1/old.png' });
    await setBannerImage(admin, 'b-1', await png(), '대체 글');

    expect(storage.remove).toHaveBeenCalledWith('products/banner-b-1/old.png');
  });
});
