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

const {
  getReviewableItems, reviewableWhere, MY_REVIEWABLE_PAGE_SIZE,
} = await import('~/lib/queries/reviews');
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
    const { items } = await getReviewableItems(buyer);
    expect(items.map((i) => i.orderItemId)).toEqual(['oi-1']);
  });

  it('파는 사람에게는 비어 있다', async () => {
    expect(await getReviewableItems(seller)).toEqual({ items: [], total: 0 });
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

/**
 * **50개에서 잘렸고 그 뒤가 있다는 표시가 없었다.**
 *
 * 마이페이지 뱃지는 상한 없이 세어 "쓸 수 있는 후기 63" 이라 적는데, 눌러 들어오면 50개만
 * 있고 나머지는 어디에도 없었다 — 화면이 거짓을 말하는 자리다. 바로 아래 '내가 쓴 리뷰' 는
 * 같은 고장을 이미 쪽으로 고쳤는데(그 주석에 "예전에는 50건에서 잘렸고" 라고 적혀 있다)
 * 이쪽만 남아 있었다.
 */
describe('쓸 것 목록의 쪽', () => {
  it('한 쪽만 읽고 전체 수를 함께 준다', async () => {
    db.orderItem.count.mockResolvedValue(63);

    const { total } = await getReviewableItems(buyer);

    const args = db.orderItem.findMany.mock.calls[0]![0];
    expect(args.take).toBe(MY_REVIEWABLE_PAGE_SIZE);
    expect(args.skip).toBe(0);
    expect(total, '화면이 적을 수가 없으면 몇 개가 더 있는지 말할 수 없다').toBe(63);
  });

  it('둘째 쪽은 한 쪽만큼 건너뛴다', async () => {
    await getReviewableItems(buyer, 2);
    expect(db.orderItem.findMany.mock.calls[0]![0].skip).toBe(MY_REVIEWABLE_PAGE_SIZE);
  });

  it('상한만 두고 끝내지 않는다 — 50 같은 숫자가 박혀 있으면 진다', async () => {
    await getReviewableItems(buyer);
    const args = db.orderItem.findMany.mock.calls[0]![0];
    expect(args.take).toBeLessThanOrEqual(20);
    expect(args.skip).toBeDefined();
  });

  it('id 로 한 번 더 가른다 — 한 주문의 여러 줄은 배송 시각이 같다', async () => {
    /*
     * 시각만으로 세우면 쪽을 넘길 때 순서가 흔들려 같은 줄이 두 쪽에 나오거나 아예 빠진다.
     * 한 주문에 줄이 여럿인 것은 드문 일이 아니다.
     */
    await getReviewableItems(buyer);

    const orderBy = db.orderItem.findMany.mock.calls[0]![0].orderBy as Record<string, unknown>[];
    expect(orderBy[0]).toEqual({ order: { deliveredAt: 'desc' } });
    expect(orderBy[1]).toEqual({ id: 'desc' });
  });

  it('마지막 쪽을 보던 중에 다 써 버리면 마지막 쪽을 다시 읽는다', async () => {
    // 그 자리에 빈 쪽으로 남으면 "없어졌다" 로 읽힌다 — 쓴 후기 쪽과 같은 손질이다
    db.orderItem.count.mockResolvedValue(12);
    db.orderItem.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([delivered]);

    const { items } = await getReviewableItems(buyer, 5);

    expect(db.orderItem.findMany).toHaveBeenCalledTimes(2);
    expect(db.orderItem.findMany.mock.calls[1]![0].skip).toBe(MY_REVIEWABLE_PAGE_SIZE);
    expect(items).toHaveLength(1);
  });

  it('목록과 마이페이지 뱃지가 **같은 조건**을 쓴다', async () => {
    /*
     * 같아야 한다고 주석에 적어 두고 조건은 두 벌로 적혀 있었다. 한쪽만 고치는 날 뱃지와
     * 목록이 다른 말을 하고, 그 숫자를 누르고 들어온 사람이 다른 목록을 만난다.
     *
     * **처음에는 목록이 자기 전체 수를 셀 때의 조건과 견주고 있었다** — 같은 함수 안의
     * 두 조회라 언제나 같고, 뱃지를 엉뚱한 조건으로 바꿔도 통과했다(돌연변이로 드러났다).
     * 견줄 상대는 마이페이지 쪽 셈이다.
     */
    await getReviewableItems(buyer);
    const listWhere = db.orderItem.findMany.mock.calls[0]![0].where;
    expect(listWhere).toEqual(reviewableWhere('u-b'));

    await getMyPageSummary(buyer);
    const badgeWhere = db.orderItem.count.mock.calls.at(-1)![0].where;

    expect(badgeWhere, '뱃지가 다른 조건으로 세면 그 숫자를 누른 사람이 다른 목록을 만난다')
      .toEqual(listWhere);
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
