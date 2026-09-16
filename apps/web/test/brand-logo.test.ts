import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImageError, type Actor } from '@shop/core';

/**
 * 브랜드 로고 — 올리기·바꾸기·떼기의 순서와 창구.
 *
 * 매장은 로고를 그리는데 올리는 곳이 없었다. 여기서 보는 것은 **파일과 행이 어긋나지 않는가**:
 * 적기가 실패하면 올린 것을 지우고, 옛 파일은 적은 뒤에 지우고, 우리가 올린 것이 아니면 건드리지 않는다.
 */

const db = vi.hoisted(() => ({
  brand: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { PrismaClientKnownRequestError: class {} } }));

const uploadImageFiles = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const discardImageKeys = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/images/upload-files', () => ({ uploadImageFiles, discardImageKeys }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const revalidateCatalog = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateCatalog }));

const { setBrandLogo, removeBrandLogo } = await import('~/lib/admin/manage-brand');
const { POST, DELETE } = await import('~/app/api/admin/brands/[id]/logo/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const PNG = { bytes: new Uint8Array([1, 2, 3]), declaredType: 'image/png' };

const brand = (over: Record<string, unknown> = {}) => ({
  id: 'b-1', merchantId: 'm-a', logoUrl: null, logoKey: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.brand.findUnique.mockResolvedValue(brand());
  db.brand.update.mockResolvedValue({});
  uploadImageFiles.mockImplementation(async (_files: unknown, keyFor: (t: string, token: string) => string) => [
    { url: 'https://cdn.test/brands/b-1/new.png', key: keyFor('image/png', 'newtoken1234'), blurDataUrl: null },
  ]);
  discardImageKeys.mockResolvedValue(undefined);
  getActor.mockResolvedValue(admin);
});

describe('올리기', () => {
  it('브랜드 아래 키로 올리고 주소와 키를 함께 적는다', async () => {
    const result = await setBrandLogo(admin, 'b-1', PNG);

    expect(db.brand.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { logoUrl: 'https://cdn.test/brands/b-1/new.png', logoKey: 'brands/b-1/newtoken1234.png' },
    });
    expect(result).toEqual({ logoUrl: 'https://cdn.test/brands/b-1/new.png', replaced: false });
    expect(discardImageKeys).not.toHaveBeenCalled();
  });

  it('바꾸면 옛 파일을 **적은 뒤에** 지운다', async () => {
    /*
     * 먼저 지우면 적기가 실패했을 때 화면에 깨진 로고가 남는다.
     */
    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://cdn.test/old.png', logoKey: 'brands/b-1/old.png' }));
    const order: string[] = [];
    db.brand.update.mockImplementation(async () => { order.push('write'); });
    discardImageKeys.mockImplementation(async (keys: string[]) => { order.push(`discard:${keys.join()}`); });

    const result = await setBrandLogo(admin, 'b-1', PNG);

    expect(order).toEqual(['write', 'discard:brands/b-1/old.png']);
    expect(result.replaced).toBe(true);
  });

  it('적기가 실패하면 방금 올린 것을 지우고, 옛 파일은 건드리지 않는다', async () => {
    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://cdn.test/old.png', logoKey: 'brands/b-1/old.png' }));
    db.brand.update.mockRejectedValue(new Error('db down'));

    await expect(setBrandLogo(admin, 'b-1', PNG)).rejects.toThrow('db down');

    expect(discardImageKeys).toHaveBeenCalledTimes(1);
    expect(discardImageKeys).toHaveBeenCalledWith(['brands/b-1/newtoken1234.png'], 'brand-logo');
  });

  it('키 없이 주소만 적힌 옛 로고는 지우지 않는다 — 우리가 올린 것인지 알 수 없다', async () => {
    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://elsewhere.test/logo.png', logoKey: null }));

    const result = await setBrandLogo(admin, 'b-1', PNG);

    expect(result.replaced).toBe(true);
    expect(discardImageKeys).not.toHaveBeenCalled();
  });

  it('이미지가 아니면 올리지도 적지도 않는다', async () => {
    uploadImageFiles.mockRejectedValue(new ImageError('UNSUPPORTED_TYPE'));

    await expect(setBrandLogo(admin, 'b-1', PNG)).rejects.toBeInstanceOf(ImageError);
    expect(db.brand.update).not.toHaveBeenCalled();
  });

  it('가맹점은 자기 브랜드만', async () => {
    db.brand.findUnique.mockResolvedValue(brand({ merchantId: 'm-other' }));

    await expect(setBrandLogo(merchantA, 'b-1', PNG)).rejects.toMatchObject({ code: 'BRAND_NOT_ALLOWED', status: 403 });
    expect(uploadImageFiles).not.toHaveBeenCalled();
  });

  it('자기 브랜드면 가맹점도 올린다 — 간판은 그 가게의 것이다', async () => {
    await expect(setBrandLogo(merchantA, 'b-1', PNG)).resolves.toMatchObject({ replaced: false });
  });

  it('없는 브랜드는 404', async () => {
    db.brand.findUnique.mockResolvedValue(null);
    await expect(setBrandLogo(admin, 'b-x', PNG)).rejects.toMatchObject({ code: 'BRAND_NOT_FOUND', status: 404 });
  });
});

describe('떼기', () => {
  it('적은 것을 비우고 파일을 지운다', async () => {
    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://cdn.test/old.png', logoKey: 'brands/b-1/old.png' }));

    expect(await removeBrandLogo(admin, 'b-1')).toEqual({ removed: true });
    expect(db.brand.update).toHaveBeenCalledWith({ where: { id: 'b-1' }, data: { logoUrl: null, logoKey: null } });
    expect(discardImageKeys).toHaveBeenCalledWith(['brands/b-1/old.png'], 'brand-logo');
  });

  it('없으면 아무것도 하지 않는다 — 두 번 눌러도 같다', async () => {
    expect(await removeBrandLogo(admin, 'b-1')).toEqual({ removed: false });
    expect(db.brand.update).not.toHaveBeenCalled();
  });

  it('키 없는 옛 로고는 행만 비운다', async () => {
    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://elsewhere.test/logo.png', logoKey: null }));

    await removeBrandLogo(admin, 'b-1');

    expect(db.brand.update).toHaveBeenCalled();
    expect(discardImageKeys).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  const post = (body: FormData | string) =>
    POST(new Request('http://localhost/api/admin/brands/b-1/logo', { method: 'POST', body }), {
      params: Promise.resolve({ id: 'b-1' }),
    });
  const form = (file?: File) => {
    const f = new FormData();
    if (file) f.append('file', file);
    return f;
  };

  it('로그인해야 한다', async () => {
    getActor.mockResolvedValue(null);
    expect((await post(form(new File([new Uint8Array([1])], 'l.png', { type: 'image/png' })))).status).toBe(401);
  });

  it('올리면 201, 매대 캐시를 털고 감사 로그를 남긴다', async () => {
    const response = await post(form(new File([new Uint8Array([1])], 'l.png', { type: 'image/png' })));

    expect(response.status).toBe(201);
    expect(revalidateCatalog).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'brand.logo.set', targetId: 'b-1' }));
  });

  it('파일이 없으면 400', async () => {
    expect((await post(form())).status).toBe(400);
  });

  it('5MB 를 넘으면 읽기 전에 막는다', async () => {
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
    expect((await post(form(big))).status).toBe(400);
    expect(uploadImageFiles).not.toHaveBeenCalled();
  });

  it('남의 브랜드면 403 을 그대로 준다', async () => {
    getActor.mockResolvedValue(merchantA);
    db.brand.findUnique.mockResolvedValue(brand({ merchantId: 'm-other' }));
    expect((await post(form(new File([new Uint8Array([1])], 'l.png', { type: 'image/png' })))).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('떼면 기록하고, 뗄 것이 없었으면 기록하지 않는다', async () => {
    const del = () => DELETE(new Request('http://localhost/api/admin/brands/b-1/logo', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'b-1' }),
    });

    expect((await del()).status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();

    db.brand.findUnique.mockResolvedValue(brand({ logoUrl: 'https://cdn.test/old.png', logoKey: 'brands/b-1/old.png' }));
    expect((await del()).status).toBe(200);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'brand.logo.remove' }));
    expect(revalidateCatalog).toHaveBeenCalledTimes(1);
  });
});
