import { describe, it, expect } from 'vitest';
import {
  averageRating, ratingScore, ratingBreakdown, sizeFitSummary,
  isReviewableStatus, isSizeFit, RATING_MAX, RATING_MIN,
} from '../src/review';

describe('평균 평점', () => {
  it('리뷰가 없으면 undefined — 0.0 은 나쁜 상품처럼 보인다', () => {
    expect(averageRating(0, 0)).toBeUndefined();
  });

  it('합계와 개수로 평균을 낸다', () => {
    expect(averageRating(18, 4)).toBe(4.5);
  });
});

describe('정렬용 점수', () => {
  it('100배 정수로 눌러 둔다 — 실수 비교는 순서가 흔들린다', () => {
    expect(ratingScore(18, 4)).toBe(450);
    expect(ratingScore(13, 3)).toBe(433); // 4.333... → 433
  });

  it('리뷰가 없으면 0 — 평점 정렬에서 맨 뒤로 간다', () => {
    expect(ratingScore(0, 0)).toBe(0);
  });

  it('만점만 있으면 500', () => {
    expect(ratingScore(25, 5)).toBe(500);
  });
});

describe('별점 분포', () => {
  it('5점부터 1점까지 빠짐없이 준다', () => {
    // 0건인 점수를 빼면 그래프에 구멍이 생겨,
    // 아무도 준 적 없는 점수와 짧은 막대를 구분할 수 없다
    const rows = ratingBreakdown({ 5: 3, 3: 1 });
    expect(rows.map((r) => r.rating)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((r) => r.count)).toEqual([3, 0, 1, 0, 0]);
  });

  it('비율은 내림한다', () => {
    const rows = ratingBreakdown({ 5: 1, 4: 1, 3: 1 });
    // 33.33% → 33
    expect(rows.find((r) => r.rating === 5)?.percent).toBe(33);
  });

  it('리뷰가 없으면 전부 0%', () => {
    expect(ratingBreakdown({}).every((r) => r.percent === 0 && r.count === 0)).toBe(true);
  });
});

describe('사이즈 분포', () => {
  it('세 항목을 항상 준다', () => {
    expect(sizeFitSummary(['TRUE']).map((s) => s.fit)).toEqual(['SMALL', 'TRUE', 'LARGE']);
  });

  it('무응답은 분모에서도 뺀다 — 정사이즈로 세면 분포가 거짓이 된다', () => {
    const rows = sizeFitSummary(['TRUE', null, null, 'LARGE']);
    expect(rows.find((r) => r.fit === 'TRUE')?.percent).toBe(50);
    expect(rows.find((r) => r.fit === 'LARGE')?.percent).toBe(50);
  });

  it('모르는 값도 무시한다', () => {
    const rows = sizeFitSummary(['TRUE', 'HUGE']);
    expect(rows.find((r) => r.fit === 'TRUE')?.percent).toBe(100);
  });

  it('아무도 답하지 않으면 전부 0%', () => {
    expect(sizeFitSummary([null, null]).every((r) => r.percent === 0)).toBe(true);
  });
});

describe('리뷰를 쓸 수 있는 상태', () => {
  it('배송 완료와 구매 확정에서만 쓴다', () => {
    expect(isReviewableStatus('DELIVERED')).toBe(true);
    expect(isReviewableStatus('CONFIRMED')).toBe(true);
  });

  it.each(['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'CANCELLED', 'REFUNDED'] as const)(
    '%s 에서는 못 쓴다',
    (status) => {
      // 받지도 않은 물건의 후기는 상품이 아니라 기대에 대한 것이다
      expect(isReviewableStatus(status)).toBe(false);
    },
  );
});

describe('사이즈 값', () => {
  it('정의된 것만 받는다', () => {
    expect(isSizeFit('TRUE')).toBe(true);
    expect(isSizeFit('HUGE')).toBe(false);
  });
});

describe('평점 범위', () => {
  it('1~5 다', () => {
    expect([RATING_MIN, RATING_MAX]).toEqual([1, 5]);
  });
});
