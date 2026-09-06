import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { isBlurDataUrl, type Actor } from '@shop/core';

/**
 * 올리는 순간 자리표시 그림을 함께 남기는가.
 *
 * **업로드를 막지 않는 것이 여기서 가장 중요하다.** 자리표시는 있으면 좋은
 * 것이지 등록의 조건이 아니다 — 만들다 실패했다고 사진이 안 올라가면,
 * 운영자는 멀쩡한 사진을 두고 왜 안 되는지 알 수 없다.
 */

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>() },
  productImage: { create: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { addProductImage } = await import('~/lib/admin/manage-images');
const { setStorage } = await import('~/lib/storage');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

/** 진짜 사진. 만들어 낸 헤더로는 자리표시를 만들 수 없다. */
const realPng = async (): Promise<Uint8Array> =>
  new Uint8Array(
    await sharp({
      create: { width: 80, height: 100, channels: 3, background: { r: 180, g: 40, b: 50 } },
    })
      .png()
      .toBuffer(),
  );

/** 형식은 맞지만 내용이 깨진 것 — 사진이 아니라 헤더만 있다 */
const brokenPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(24).fill(0)]);

beforeEach(() => {
  vi.clearAllMocks();
  setStorage({
    name: 'fake',
    put: vi.fn(async ({ key }: { key: string }) => ({ url: `https://cdn.test/${key}` })),
    remove: vi.fn(async () => {}),
  });
  db.product.findFirst.mockResolvedValue({
    id: 'p-1', name: '울 코트',
    brand: { name: 'MOOR', merchantId: null },
    _count: { images: 0 },
  });
  db.productImage.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'i-1', url: data['url'], alt: data['alt'], sortOrder: 0,
  }));
});

const written = () => db.productImage.create.mock.calls[0]![0].data as Record<string, unknown>;

describe('사진을 올리면 자리표시도 함께 남는다', () => {
  it('진짜 사진에서 만들어 넣는다', async () => {
    await addProductImage(admin, 'p-1', { bytes: await realPng(), declaredType: 'image/png' });

    const blur = written()['blurDataUrl'];
    expect(isBlurDataUrl(blur as string)).toBe(true);
  });

  it('만들지 못해도 사진은 올라간다 — 자리표시는 등록의 조건이 아니다', async () => {
    const image = await addProductImage(admin, 'p-1', {
      bytes: brokenPng,
      declaredType: 'image/png',
    });

    // 등록 자체는 성공하고
    expect(image.url).toMatch(/^https:\/\/cdn\.test\//);
    // 자리표시만 비어 있다(그때는 톤 블록이 깔린다)
    expect(written()['blurDataUrl']).toBeNull();
  });
});
