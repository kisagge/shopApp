import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 상품 화면의 리뷰 요지 — 별점 분포와 사이즈 분포.
 *
 * **사이즈 분포가 500개에서 잘렸다.** 전에는 답변 행을 `take: 500` 으로 끌어와 세었다.
 * 그 수를 넘는 상품은 **아무 표시 없이 500개분의 비율**을 보여 주고, 정렬이 없었으니 어느
 * 500개인지도 정해져 있지 않았다 — 화면에 뜨는 것은 퍼센트뿐이라 숫자가 적어 보이지도
 * 않는다. 세어 달라고 하면 상한이 필요 없다.
 */

const db = vi.hoisted(() => ({
  review: { groupBy: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { JsonNull: 'JsonNull' } }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getReviewSummary } = await import('~/lib/queries/reviews');

/** 별점 묶음과 사이즈 묶음이 같은 함수로 들어온다 — 어느 쪽인지 by 로 가린다 */
const answer = (byRating: unknown[], bySizeFit: unknown[]) => {
  db.review.groupBy.mockImplementation(async (args: { by: string[] }) =>
    args.by.includes('rating') ? byRating : bySizeFit,
  );
};

const rating = (r: number, count: number) => ({ rating: r, _count: { _all: count } });
const fit = (value: string | null, count: number) => ({ sizeFit: value, _count: { _all: count } });

const callFor = (by: string) =>
  db.review.groupBy.mock.calls.map(([a]) => a).find((a: { by: string[] }) => a.by.includes(by));

beforeEach(() => {
  vi.clearAllMocks();
  answer([rating(5, 2)], [fit('TRUE', 1)]);
});

describe('리뷰 요지', () => {
  it('별점과 사이즈를 각각 세어 달라고 한다', async () => {
    await getReviewSummary('p-1');
    expect(db.review.groupBy).toHaveBeenCalledTimes(2);
    expect(callFor('rating')).toBeTruthy();
    expect(callFor('sizeFit')).toBeTruthy();
  });

  it('행을 끌어오지 않는다 — 상한이 필요했던 까닭이 그것이었다', async () => {
    await getReviewSummary('p-1');
    expect(db.review.findMany).not.toHaveBeenCalled();
    for (const [args] of db.review.groupBy.mock.calls) {
      expect(args).not.toHaveProperty('take');
    }
  });

  it('사이즈는 답한 것만 센다 — 무응답을 세면 분포가 거짓이 된다', async () => {
    await getReviewSummary('p-1');
    expect(callFor('sizeFit').where).toEqual({
      productId: 'p-1',
      deletedAt: null,
      sizeFit: { not: null },
    });
  });

  it('지운 리뷰는 별점에서도 뺀다', async () => {
    await getReviewSummary('p-1');
    expect(callFor('rating').where).toEqual({ productId: 'p-1', deletedAt: null });
  });

  it('센 수가 그대로 비율이 된다 — 몇 천 개여도 잘리지 않는다', async () => {
    answer([rating(5, 4_000)], [fit('SMALL', 1_200), fit('TRUE', 2_400), fit('LARGE', 400)]);

    const summary = await getReviewSummary('p-1');

    expect(summary.sizeFit.map((s) => s.percent)).toEqual([30, 60, 10]);
    expect(summary.sizeFit.map((s) => s.count)).toEqual([1_200, 2_400, 400]);
  });

  it('별점 평균과 전체 수는 센 값에서 나온다', async () => {
    answer([rating(5, 3), rating(3, 1)], []);

    const summary = await getReviewSummary('p-1');

    expect(summary.total).toBe(4);
    expect(summary.average).toBe(4.5);
  });

  it('모르는 갈래가 와도 비율이 흔들리지 않는다', async () => {
    /*
     * 열거형이 갈리면 정합성 검사가 먼저 지지만, 그 사이에 들어온 값을 분모에 넣으면
     * 비율이 조용히 틀린다. 경계에서 걸러 둔다.
     */
    answer([rating(5, 1)], [fit('TRUE', 1), fit('HUGE', 9), fit(null, 5)]);

    const summary = await getReviewSummary('p-1');

    expect(summary.sizeFit.find((s) => s.fit === 'TRUE')?.percent).toBe(100);
  });

  it('아무도 답하지 않으면 전부 0% — 화면이 그 영역을 접는다', async () => {
    answer([rating(5, 1)], []);

    const summary = await getReviewSummary('p-1');

    expect(summary.sizeFit.every((s) => s.count === 0 && s.percent === 0)).toBe(true);
  });
});
