import { describe, it, expect } from 'vitest';
import { couponCoversProduct, isDownloadable } from '../src';

const NOW = new Date('2026-09-15T00:00:00Z');
const coupon = (over: Record<string, unknown> = {}) => ({
  downloadable: true, isActive: true, startsAt: new Date('2026-09-01'), endsAt: new Date('2026-09-30'),
  issueLimit: null, issuedCount: 0, ...over,
});

describe('isDownloadable', () => {
  it('공개했고 지금 발급할 수 있을 때만', () => {
    expect(isDownloadable(coupon(), NOW)).toBe(true);
    expect(isDownloadable(coupon({ downloadable: false }), NOW), '공개하지 않은 코드 쿠폰이 목록에 올랐다').toBe(false);
    expect(isDownloadable(coupon({ isActive: false }), NOW)).toBe(false);
    expect(isDownloadable(coupon({ startsAt: new Date('2026-09-20') }), NOW)).toBe(false);
    expect(isDownloadable(coupon({ endsAt: new Date('2026-09-10') }), NOW)).toBe(false);
    expect(isDownloadable(coupon({ issueLimit: 5, issuedCount: 5 }), NOW)).toBe(false);
  });
});

describe('couponCoversProduct', () => {
  const product = { id: 'p-1', brandId: 'b-1', categoryId: 'c-1' };
  it('대상이 없으면 전체, 있으면 상품·브랜드·카테고리 중 하나라도', () => {
    expect(couponCoversProduct([], product)).toBe(true);
    expect(couponCoversProduct([{ targetType: 'BRAND', targetId: 'b-1' }], product)).toBe(true);
    expect(couponCoversProduct([{ targetType: 'CATEGORY', targetId: 'c-1' }], product)).toBe(true);
    expect(couponCoversProduct([{ targetType: 'PRODUCT', targetId: 'p-2' }, { targetType: 'BRAND', targetId: 'b-9' }], product)).toBe(false);
  });
});
