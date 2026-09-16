import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 리뷰 쓸 것 목록과 마이페이지 뱃지.
 *
 * **서버가 막는 것을 화면이 권하지 않는다.** 파는 사람의 계정은 리뷰를 쓸 수
 * 없는데(canWriteReview), 목록과 뱃지가 그대로면 폼을 다 채워 보내고 나서야
 * 403 을 본다. 둘은 같은 조건을 봐야 숫자도 맞는다.
 */

const db = vi.hoisted(() => ({
  orderItem: {
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
  },
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
  order: { groupBy: vi.fn<(...a: any[]) => any>() },
  userCoupon: { count: vi.fn<(...a: any[]) => any>() },
  wishlistItem: { count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/grade/effective', () => ({
  getEffectiveGrade: vi.fn(async () => ({ grade: 'BASIC', totalSpent: 0, rate: 1 })),
}));

const { getReviewableItems } = await import('~/lib/queries/reviews');
const { getMyPageSummary } = await import('~/lib/queries/mypage');

const buyer: Actor = { id: 'u-b', role: 'CUSTOMER', merchantId: null };
const seller: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const delivered = {
  id: 'oi-1', productName: '울 코트', brandName: '무어', optionLabel: '오트 / M',
  imageUrl: null,
  order: { orderNo: '20260915-1234567', deliveredAt: new Date('2026-09-10T00:00:00Z') },
  variant: { product: { slug: 'wool-coat' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.orderItem.findMany.mockResolvedValue([delivered]);
  db.orderItem.count.mockResolvedValue(3);
  db.user.findUnique.mockResolvedValue({
    name: '손', email: 'a@b.c', grade: 'BASIC', pointBalance: 0, marketingAgreedAt: null,
  });
  db.order.groupBy.mockResolvedValue([]);
  db.userCoupon.count.mockResolvedValue(0);
  db.wishlistItem.count.mockResolvedValue(0);
});

describe('쓸 것 목록', () => {
  it('손님에게는 배송이 끝난 줄이 보인다', async () => {
    const items = await getReviewableItems(buyer);
    expect(items.map((i) => i.orderItemId)).toEqual(['oi-1']);
  });

  it('파는 사람에게는 비어 있다', async () => {
    expect(await getReviewableItems(seller)).toEqual([]);
  });

  it('파는 사람의 것은 아예 조회하지 않는다 — 버릴 줄을 읽을 까닭이 없다', async () => {
    await getReviewableItems(seller);
    expect(db.orderItem.findMany).not.toHaveBeenCalled();
  });

  it('자기 주문만 본다', async () => {
    await getReviewableItems(buyer);
    expect(db.orderItem.findMany.mock.calls[0]![0].where.order.userId).toBe('u-b');
  });
});

describe('마이페이지 뱃지', () => {
  it('손님은 쓸 것의 개수를 본다', async () => {
    expect((await getMyPageSummary(buyer))?.reviewableCount).toBe(3);
  });

  it('파는 사람에게는 0 이다 — 뱃지를 보고 들어가면 빈 화면을 만난다', async () => {
    /*
     * 목록이 비는데 뱃지에 3 이 뜨면, 화면이 스스로와 어긋난 말을 한다.
     * 숫자와 목록은 같은 조건을 봐야 한다.
     */
    expect((await getMyPageSummary(seller))?.reviewableCount).toBe(0);
    expect(db.orderItem.count).not.toHaveBeenCalled();
  });
});
