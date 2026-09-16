import { describe, it, expect } from 'vitest';
import {
  averageRating, ratingScore, ratingBreakdown, sizeFitSummary,
  isReviewableStatus, isSizeFit, planReviewImages, reviewChanged, RATING_MAX, RATING_MIN,
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

describe('사진 갈아 끼우기', () => {
  const photos = [
    { id: 'i-1', storageKey: 'k-1' },
    { id: 'i-2', storageKey: 'k-2' },
    { id: 'i-3', storageKey: 'k-3' },
  ];

  it('남길 것만 남기고 나머지는 뺄 대상이 된다', () => {
    const plan = planReviewImages(photos, ['i-1', 'i-3'], 0);
    expect(plan.keep.map((i) => i.id)).toEqual(['i-1', 'i-3']);
    // 저장소에서도 지워야 하므로 키까지 들고 나간다
    expect(plan.remove.map((i) => i.storageKey)).toEqual(['k-2']);
  });

  it('원래 차례를 지킨다 — 남길 것을 거꾸로 적어 보내도 사진이 뒤집히지 않는다', () => {
    expect(planReviewImages(photos, ['i-3', 'i-1'], 0).keep.map((i) => i.id)).toEqual(['i-1', 'i-3']);
  });

  it('모르는 id 는 무시한다 — 남의 사진 id 를 끼워 넣어도 이 리뷰의 것이 아니면 들어오지 않는다', () => {
    const plan = planReviewImages(photos, ['i-1', 'someone-elses'], 0);
    expect(plan.keep.map((i) => i.id)).toEqual(['i-1']);
    expect(plan.remove).toHaveLength(2);
  });

  it('한도는 남길 것과 새로 올릴 것을 함께 센다', () => {
    // 세 장을 그대로 두고 세 장을 더하면 여섯 장이다
    expect(planReviewImages(photos, ['i-1', 'i-2', 'i-3'], 3).overLimit).toBe(true);
    // 두 장을 빼고 세 장을 더하면 네 장이라 들어간다
    expect(planReviewImages(photos, ['i-1'], 3).overLimit).toBe(false);
  });

  it('빈 목록은 전부 빼라는 뜻이다', () => {
    expect(planReviewImages(photos, [], 0).remove).toHaveLength(3);
  });
});

describe('고쳐졌는가', () => {
  const before = { rating: 4, content: '두껍고 따뜻합니다', sizeFit: 'TRUE', height: 175, weight: 70 };

  it('값이 달라지면 고쳐진 것이다', () => {
    expect(reviewChanged(before, { content: '생각보다 얇습니다' })).toBe(true);
    expect(reviewChanged(before, { rating: 2 })).toBe(true);
  });

  it('같은 값을 그대로 저장하면 고쳐진 것이 아니다', () => {
    /*
     * 아무것도 안 바꾸고 나온 사람에게까지 "수정됨" 이 붙으면, 그 표시를 보고 "내가 읽은 것과 다른 글일 수 있다" 고
     * 판단하는 사람을 헛되게 만든다.
     */
    expect(reviewChanged(before, { rating: 4, content: '두껍고 따뜻합니다' })).toBe(false);
  });

  it('보내지 않은 칸은 견주지 않는다 — 부분 갱신이다', () => {
    expect(reviewChanged(before, { rating: undefined, content: undefined })).toBe(false);
  });

  it('글자 하나 안 바뀌어도 사진이 바뀌었으면 고쳐진 것이다', () => {
    expect(reviewChanged(before, {}, true)).toBe(true);
  });
});
