import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 마이페이지 목록의 쪽 넘기기.
 *
 * **잘라 놓고 말하지 않았다.** 포인트는 30건, 리뷰는 50건, 문의는 10건까지만 보였고 그 뒤가 있다는 표시도 없었다.
 * 문의는 커서를 받게 만들어 놓고 화면이 한 번도 넘기지 않았다. 세 목록 모두 같은 셈법(쪽 번호 · 전체 수 ·
 * 넘친 쪽은 마지막 쪽으로)을 따르는지 본다. 주문 목록은 my-orders-filter 가 본다.
 */

const db = vi.hoisted(() => ({
  pointTransaction: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  review: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  inquiry: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/grade/effective', () => ({ getEffectiveGrade: vi.fn() }));
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: unknown) => fn,
  TAG: { catalog: 'catalog' },
  TTL: { catalog: 3600 },
}));

const { getPointHistory, POINT_HISTORY_PAGE_SIZE } = await import('~/lib/queries/mypage');
const { getMyReviews, MY_REVIEW_PAGE_SIZE } = await import('~/lib/queries/reviews');
const { getMyInquiries, MY_INQUIRY_PAGE_SIZE } = await import('~/lib/queries/inquiries');

beforeEach(() => {
  vi.clearAllMocks();
  for (const table of Object.values(db)) {
    table.findMany.mockResolvedValue([]);
    table.count.mockResolvedValue(0);
  }
});

describe('포인트 내역', () => {
  it('쪽 번호만큼 건너뛰고 전체 수를 준다', async () => {
    db.pointTransaction.count.mockResolvedValue(95);
    db.pointTransaction.findMany.mockResolvedValue([{ amount: 100, reason: 'EARN_REVIEW', note: null, createdAt: new Date() }]);

    const page = await getPointHistory('u-1', 2);

    expect(db.pointTransaction.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: 'u-1' }, skip: POINT_HISTORY_PAGE_SIZE, take: POINT_HISTORY_PAGE_SIZE,
    });
    expect(page.total).toBe(95);
    expect(page.items).toHaveLength(1);
  });

  it('같은 순간에 적힌 줄이 쪽마다 흔들리지 않게 id 로 마저 가른다', async () => {
    await getPointHistory('u-1');
    expect(db.pointTransaction.findMany.mock.calls[0]![0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('없는 쪽을 달라면 마지막 쪽을 준다', async () => {
    db.pointTransaction.count.mockResolvedValue(31);
    db.pointTransaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ amount: 1, reason: 'EARN_REVIEW', note: null, createdAt: new Date() }]);

    const page = await getPointHistory('u-1', 7);

    expect(db.pointTransaction.findMany.mock.calls[1]![0].skip).toBe(POINT_HISTORY_PAGE_SIZE);
    expect(page.items).toHaveLength(1);
  });
});

describe('내 리뷰', () => {
  it('지운 리뷰를 빼고 세고, 쪽 번호만큼 건너뛴다', async () => {
    db.review.count.mockResolvedValue(60);

    const page = await getMyReviews('u-1', 3);

    expect(db.review.count.mock.calls[0]![0].where).toEqual({ userId: 'u-1', deletedAt: null });
    expect(db.review.findMany.mock.calls[0]![0]).toMatchObject({
      where: { userId: 'u-1', deletedAt: null }, skip: MY_REVIEW_PAGE_SIZE * 2, take: MY_REVIEW_PAGE_SIZE,
    });
    // 제목 옆 숫자는 이 쪽의 줄 수가 아니라 전체다 — 예전에는 50 에서 멈췄다
    expect(page.total).toBe(60);
  });
});

describe('내 문의', () => {
  it('첫 쪽 뒤로도 넘긴다 — 열한 번째 문의부터 볼 길이 없었다', async () => {
    db.inquiry.count.mockResolvedValue(23);

    const page = await getMyInquiries('u-1', 2);

    expect(db.inquiry.findMany.mock.calls[0]![0]).toMatchObject({
      where: { authorId: 'u-1', deletedAt: null }, skip: MY_INQUIRY_PAGE_SIZE, take: MY_INQUIRY_PAGE_SIZE,
    });
    expect(db.inquiry.count.mock.calls[0]![0].where).toEqual({ authorId: 'u-1', deletedAt: null });
    expect(page.total).toBe(23);
  });
});
