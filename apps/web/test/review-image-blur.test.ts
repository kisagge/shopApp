import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { isBlurDataUrl } from '@shop/core';

/**
 * 리뷰 사진에도 자리표시를 만든다.
 *
 * 상품·배너·기획전에는 붙였는데 리뷰만 빠져 있었다. **담아 둘 칸이 없어서다**
 * — 리뷰는 주소 배열과 키 배열 둘로 사진을 들고 있었고, 사진마다 딸린 값을
 * 붙일 자리가 없었다. 표로 옮기면서 자리가 생겼다.
 *
 * 사용자가 올리는 사진이라 상품 사진보다 크고, 리뷰 목록에는 여러 장이 한
 * 화면에 깔린다.
 */

const put = vi.hoisted(() =>
  vi.fn<(...a: any[]) => any>(async ({ key }: { key: string }) => ({ url: `https://cdn.test/${key}` })),
);
vi.mock('~/lib/storage', () => ({
  getStorage: () => ({ name: 'fake', put, remove: vi.fn(async () => {}) }),
}));

const { uploadReviewImages } = await import('~/lib/reviews/images');

/** 진짜 사진. 만들어 낸 헤더로는 자리표시를 만들 수 없다. */
const realPng = async (): Promise<Uint8Array> =>
  new Uint8Array(
    await sharp({ create: { width: 60, height: 80, channels: 3, background: { r: 30, g: 90, b: 60 } } })
      .png()
      .toBuffer(),
  );

/** 형식은 맞지만 내용이 깨진 것 */
const brokenPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(24).fill(0)]);

beforeEach(() => vi.clearAllMocks());

describe('올리면서 자리표시도 만든다', () => {
  it('진짜 사진에서 만들어 함께 돌려준다', async () => {
    const [image] = await uploadReviewImages('oi-1', [
      { bytes: await realPng(), declaredType: 'image/png' },
    ]);

    expect(isBlurDataUrl(image!.blurDataUrl)).toBe(true);
  });

  /**
   * **자리표시는 업로드의 조건이 아니다.** 여기서 던지면 사진이 멀쩡한데도
   * 리뷰가 저장되지 않고, 쓴 사람은 왜 안 되는지 알 수 없다.
   */
  it('만들지 못해도 사진은 올라간다', async () => {
    const [image] = await uploadReviewImages('oi-1', [
      { bytes: brokenPng, declaredType: 'image/png' },
    ]);

    expect(image!.url).toMatch(/^https:\/\/cdn\.test\//);
    expect(image!.blurDataUrl).toBeNull();
  });

  it('여러 장이면 각자의 자리표시를 가진다 — 한 장의 것을 돌려 쓰지 않는다', async () => {
    const images = await uploadReviewImages('oi-1', [
      { bytes: await realPng(), declaredType: 'image/png' },
      { bytes: brokenPng, declaredType: 'image/png' },
    ]);

    expect(images).toHaveLength(2);
    expect(isBlurDataUrl(images[0]!.blurDataUrl)).toBe(true);
    expect(images[1]!.blurDataUrl).toBeNull();
  });
});
