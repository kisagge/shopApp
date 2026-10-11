import { describe, it, expect } from 'vitest';
import { COUPON_TARGET_TYPE } from '@shop/core';
import { createCouponSchema } from '../src/coupon';

/**
 * **대상 종류 목록을 두 곳에 적지 않는다.**
 *
 * 계약이 `z.enum(['PRODUCT', 'BRAND', 'CATEGORY'])` 를 손으로 적고 있었다. 값이 같아서 조용했지만,
 * core 에 종류가 하나 늘면 화면은 고를 수 있는데 창구가 **까닭 없이 거절한다** — 송장·리뷰에서
 * 이미 겪은 모양이다(duplicated-enum-lists 가 그래서 생겼다).
 */

const base = {
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
  downloadable: false,
};

describe('쿠폰 대상 종류', () => {
  it('core 가 아는 종류는 전부 받는다', () => {
    for (const targetType of COUPON_TARGET_TYPE) {
      const parsed = createCouponSchema.safeParse({
        ...base,
        targets: [{ targetType, targetId: 'x-1' }],
      });

      expect(parsed.success, targetType).toBe(true);
    }
  });

  it('모르는 종류는 거절한다', () => {
    const parsed = createCouponSchema.safeParse({
      ...base,
      targets: [{ targetType: 'MERCHANT', targetId: 'm-1' }],
    });

    expect(parsed.success).toBe(false);
  });

  it('대상이 없어도 된다 — 장바구니 전체 쿠폰이다', () => {
    expect(createCouponSchema.safeParse({ ...base, targets: [] }).success).toBe(true);
  });
});
