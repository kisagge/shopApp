import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_SORT, reviewListQuerySchema } from '@shop/contract';

const db = vi.hoisted(() => ({
  review: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  reviewReport: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
  reviewHelpful: { findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: unknown) => fn,
  TAG: { catalog: 'catalog' },
  TTL: { catalog: 60 },
}));

const { getProductReviews } = await import('~/lib/queries/reviews');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', rating: 4, content: '좋아요', sizeFit: null, height: null, weight: null,
  createdAt: new Date('2026-01-01'), userId: 'u-author', imageUrls: [], helpfulCount: 0,
  user: { name: '홍길동' }, orderItem: { optionLabel: 'M' },
  ...over,
});

const orderBy = () => db.review.findMany.mock.calls[0]![0].orderBy;

beforeEach(() => {
  vi.clearAllMocks();
  db.review.findMany.mockResolvedValue([]);
  db.reviewReport.findMany.mockResolvedValue([]);
  db.reviewHelpful.findMany.mockResolvedValue([]);
});

describe('정렬', () => {
  it('기본은 최신순이다', async () => {
    await getProductReviews('p-1');
    expect(orderBy()[0]).toEqual({ createdAt: 'desc' });
  });

  it('도움순은 표가 많은 것부터다', async () => {
    await getProductReviews('p-1', { sort: 'helpful' });
    expect(orderBy()[0]).toEqual({ helpfulCount: 'desc' });
  });

  it('표가 같으면 최신순으로 이어 간다 — 순서가 흔들리면 안 된다', async () => {
    /*
     * 표가 하나도 없을 때 도움순의 순서가 제멋대로면 새로고침마다 목록이
     * 뒤집힌다.
     */
    await getProductReviews('p-1', { sort: 'helpful' });
    expect(orderBy()[1]).toEqual({ createdAt: 'desc' });
  });

  it.each([...REVIEW_SORT])('%s 는 순서가 완전히 정해진다', async (sort) => {
    // 마지막 기준이 id 여야 같은 값끼리도 순서가 고정된다
    await getProductReviews('p-1', { sort });
    expect(orderBy().at(-1)).toHaveProperty('id');
  });
});

describe('주소에서 정렬을 읽는 길', () => {
  it('아는 값만 받는다', () => {
    expect(reviewListQuerySchema.parse({ sort: 'helpful' }).sort).toBe('helpful');
  });

  it('모르는 값은 최신순으로 되돌린다 — 화면이 죽지 않아야 한다', () => {
    expect(reviewListQuerySchema.parse({ sort: '<script>' }).sort).toBe('recent');
    expect(reviewListQuerySchema.parse({}).sort).toBe('recent');
  });

  it('화면이 주소에서 쓰는 이름과 계약이 읽는 이름이 이어져 있다', () => {
    /*
     * 주소에서는 reviewSort 라고 부르고 계약은 sort 를 읽는다. 옮겨 담는
     * 것을 빠뜨리면 **탭은 눌리는데 목록은 그대로**가 된다 — 실제로 한 번
     * 그렇게 만들었다. 상품 화면이 그 다리를 놓는지 확인한다.
     */
    const source = readFileSync(join(process.cwd(), 'src/app/product/[slug]/page.tsx'), 'utf8');
    expect(source).toContain("sort: (await searchParams)['reviewSort']");
  });
});

describe('내가 누른 것', () => {
  it('로그인하지 않으면 묻지 않는다', async () => {
    db.review.findMany.mockResolvedValue([row()]);

    const page = await getProductReviews('p-1');

    expect(db.reviewHelpful.findMany).not.toHaveBeenCalled();
    expect(page.items[0]!.helpfulByMe).toBe(false);
  });

  it('한 번에 묻는다 — 리뷰마다 물으면 리뷰 수만큼 질의가 나간다', async () => {
    db.review.findMany.mockResolvedValue([row({ id: 'r-1' }), row({ id: 'r-2' })]);
    db.reviewHelpful.findMany.mockResolvedValue([{ reviewId: 'r-2' }]);

    const page = await getProductReviews('p-1', { viewerId: 'u-me' });

    expect(db.reviewHelpful.findMany).toHaveBeenCalledTimes(1);
    expect(db.reviewHelpful.findMany.mock.calls[0]![0].where.reviewId.in).toEqual(['r-1', 'r-2']);
    expect(page.items.map((i) => i.helpfulByMe)).toEqual([false, true]);
  });
});
