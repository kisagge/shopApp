import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>() },
  productImage: {
    create: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>(), findFirst: vi.fn<(...a: any[]) => any>(), delete: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>(), findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  addProductImage, updateImageAlt, deleteProductImage, reorderProductImages,
} = await import('~/lib/admin/manage-images');
const { setStorage } = await import('~/lib/storage');

const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(24).fill(0)]);
const HTML = new Uint8Array([0x3c, 0x21, 0x44, 0x4f, 0x43, ...Array(24).fill(0)]);

const storage = {
  name: 'fake',
  put: vi.fn<(...a: any[]) => any>(async ({ key }: { key: string }) => ({ url: `https://cdn.test/${key}` })),
  remove: vi.fn<(...a: any[]) => any>(async () => {}),
};

const product = (imageCount = 0) => ({
  id: 'p-1',
  name: '울 코트',
  brand: { name: 'MOOR', merchantId: 'm-a' },
  _count: { images: imageCount },
});

beforeEach(() => {
  vi.clearAllMocks();
  setStorage(storage);
  db.product.findFirst.mockResolvedValue(product());
  db.productImage.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'i-new', url: data['url'], alt: data['alt'], sortOrder: data['sortOrder'] }));
  db.$transaction.mockResolvedValue([]);
});

afterEach(() => setStorage(undefined));

describe('업로드 — 권한', () => {
  it('자기 브랜드 상품에는 올릴 수 있다', async () => {
    await expect(addProductImage(merchantA, 'p-1', { bytes: PNG, declaredType: 'image/png' }))
      .resolves.toMatchObject({ id: 'i-new' });
  });

  it('남의 상품은 조회에서 걸린다', async () => {
    db.product.findFirst.mockResolvedValue(null);
    await expect(addProductImage(merchantB, 'p-1', { bytes: PNG, declaredType: 'image/png' }))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('고객은 404 를 받는다 — 권한 부족이라고 알려 주지 않는다', async () => {
    // merchantScope 가 undefined 를 주면 조회 자체가 성립하지 않는다.
    // "권한이 없다" 대신 "없다" 로 답해야 상품 id 의 존재를 확인해 주지 않는다.
    await expect(addProductImage(customer, 'p-1', { bytes: PNG, declaredType: 'image/png' }))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', status: 404 });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('가맹점 조회에는 브랜드 범위가 걸린다', async () => {
    await addProductImage(merchantA, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    expect(db.product.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      brand: { merchantId: 'm-a' },
    });
  });
});

describe('업로드 — 검증과 순서', () => {
  it('내용이 이미지가 아니면 저장소를 건드리지 않는다', async () => {
    await expect(addProductImage(admin, 'p-1', { bytes: HTML, declaredType: 'image/png' }))
      .rejects.toMatchObject({ code: 'CONTENT_MISMATCH' });
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.productImage.create).not.toHaveBeenCalled();
  });

  it('8장을 넘기면 거절한다', async () => {
    db.product.findFirst.mockResolvedValue(product(8));
    await expect(addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' }))
      .rejects.toMatchObject({ code: 'TOO_MANY_IMAGES' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('저장소 먼저, DB 나중이다', async () => {
    // 반대 순서면 DB 가 없는 이미지를 가리켜 화면이 깨진다.
    // 이 순서면 최악의 경우 아무도 안 쓰는 객체만 남는다.
    const order: string[] = [];
    storage.put.mockImplementation(async ({ key }: { key: string }) => {
      order.push('storage');
      return { url: `https://cdn.test/${key}` };
    });
    db.productImage.create.mockImplementation(() => {
      order.push('db');
      return Promise.resolve({ id: 'i-new', url: 'u', alt: 'a', sortOrder: 0 });
    });
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    expect(order).toEqual(['storage', 'db']);
  });

  it('저장 키에 파일 이름이 들어가지 않는다', async () => {
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    const key = storage.put.mock.calls[0]?.[0].key as string;
    expect(key).toMatch(/^products\/p-1\/[A-Za-z0-9_-]{8,}\.png$/);
  });

  it('sortOrder 는 기존 장수를 잇는다', async () => {
    db.product.findFirst.mockResolvedValue(product(3));
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    expect(db.productImage.create.mock.calls[0]?.[0].data.sortOrder).toBe(3);
  });

  it('대체 텍스트를 안 주면 브랜드와 상품명으로 만든다', async () => {
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    expect(db.productImage.create.mock.calls[0]?.[0].data.alt).toBe('MOOR 울 코트');
  });

  it('공백만 준 대체 텍스트도 기본값으로 대체한다', async () => {
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' }, '   ');
    expect(db.productImage.create.mock.calls[0]?.[0].data.alt).toBe('MOOR 울 코트');
  });

  it('준 대체 텍스트가 있으면 그것을 쓴다', async () => {
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' }, '코트 정면');
    expect(db.productImage.create.mock.calls[0]?.[0].data.alt).toBe('코트 정면');
  });

  it('storageKey 를 함께 저장한다 — url 에서 잘라 쓰지 않기 위해', async () => {
    await addProductImage(admin, 'p-1', { bytes: PNG, declaredType: 'image/png' });
    const data = db.productImage.create.mock.calls[0]?.[0].data;
    expect(data.storageKey).toBe(storage.put.mock.calls[0]?.[0].key);
    expect(data.url).toContain(data.storageKey);
  });
});

describe('대체 텍스트 수정', () => {
  beforeEach(() => {
    db.productImage.updateMany.mockResolvedValue({ count: 1 });
    db.productImage.findUniqueOrThrow.mockResolvedValue({
      id: 'i-1', url: 'u', alt: '코트 정면', sortOrder: 0,
    });
  });

  it('빈 값은 거절한다 — 스크린리더에 아무것도 안 읽힌다', async () => {
    await expect(updateImageAlt(admin, 'p-1', 'i-1', '   '))
      .rejects.toMatchObject({ code: 'ALT_REQUIRED' });
    expect(db.productImage.updateMany).not.toHaveBeenCalled();
  });

  it('productId 를 함께 걸어 남의 이미지 id 를 막는다', async () => {
    await updateImageAlt(admin, 'p-1', 'i-1', '코트 정면');
    expect(db.productImage.updateMany.mock.calls[0]?.[0].where)
      .toEqual({ id: 'i-1', productId: 'p-1' });
  });

  it('이 상품 것이 아니면 404', async () => {
    db.productImage.updateMany.mockResolvedValue({ count: 0 });
    await expect(updateImageAlt(admin, 'p-1', 'i-x', '무엇'))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('삭제', () => {
  beforeEach(() => {
    db.productImage.findFirst.mockResolvedValue({ id: 'i-1', storageKey: 'products/p-1/abc.png' });
    db.productImage.delete.mockResolvedValue({});
    db.productImage.findMany.mockResolvedValue([
      { id: 'i-2', url: 'u2', alt: 'a2', sortOrder: 1 },
      { id: 'i-3', url: 'u3', alt: 'a3', sortOrder: 2 },
    ]);
  });

  it('DB 와 저장소에서 모두 지운다', async () => {
    await deleteProductImage(admin, 'p-1', 'i-1');
    expect(db.productImage.delete).toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith('products/p-1/abc.png');
  });

  it('삭제 뒤 순서를 0부터 다시 매긴다', async () => {
    // 구멍이 남으면 목록의 대표 이미지 판정이 흔들린다
    const { remaining } = await deleteProductImage(admin, 'p-1', 'i-1');
    expect(remaining.map((r) => r.sortOrder)).toEqual([0, 1]);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('저장소 삭제가 실패해도 화면에서는 사라진다', async () => {
    // 남은 객체는 눈에 보이는 피해가 없지만, DB 만 남기면 깨진 이미지가 뜬다
    storage.remove.mockRejectedValue(new Error('네트워크'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(deleteProductImage(admin, 'p-1', 'i-1')).resolves.toBeDefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('storageKey 가 없으면 저장소를 건드리지 않는다', async () => {
    db.productImage.findFirst.mockResolvedValue({ id: 'i-1', storageKey: null });
    await deleteProductImage(admin, 'p-1', 'i-1');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('남의 상품 이미지는 404', async () => {
    db.productImage.findFirst.mockResolvedValue(null);
    await expect(deleteProductImage(admin, 'p-1', 'i-x'))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('순서 변경', () => {
  beforeEach(() => {
    db.productImage.findMany.mockResolvedValue([{ id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }]);
  });

  it('전체를 순서대로 받으면 0,1,2 로 다시 매긴다', async () => {
    db.productImage.findMany
      .mockResolvedValueOnce([{ id: 'i-1' }, { id: 'i-2' }, { id: 'i-3' }])
      .mockResolvedValueOnce([
        { id: 'i-3', url: 'u', alt: 'a', sortOrder: 0 },
        { id: 'i-1', url: 'u', alt: 'a', sortOrder: 1 },
        { id: 'i-2', url: 'u', alt: 'a', sortOrder: 2 },
      ]);
    const result = await reorderProductImages(admin, 'p-1', ['i-3', 'i-1', 'i-2']);
    expect(result.map((r) => r.id)).toEqual(['i-3', 'i-1', 'i-2']);
  });

  it('일부만 보내면 거절한다 — 나머지 순서가 정의되지 않는다', async () => {
    await expect(reorderProductImages(admin, 'p-1', ['i-1', 'i-2']))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('남의 이미지 id 를 섞으면 거절한다', async () => {
    await expect(reorderProductImages(admin, 'p-1', ['i-1', 'i-2', 'i-999']))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
