import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REVIEW_SORT, type ReviewSort } from '@shop/contract';

/**
 * 리뷰 정렬은 DB 가 줄을 세운다.
 *
 * **왜 이 검사가 생겼는가.** 최신순과 도움순에는 인덱스가 있었는데 별점순 둘에는
 * 없었다. 그러면 한 상품의 리뷰를 전부 읽어 메모리에서 세우게 되고, 거기에 커서
 * 페이지 넘기기까지 얹힌다 — 리뷰가 몇 건뿐인 상품에서는 티가 안 나고 **잘 팔린
 * 상품에서만** 드러난다. 탭을 하나 더 만들 때 인덱스를 함께 두지 않으면 같은 일이
 * 또 조용히 생긴다.
 *
 * 정렬 목록은 계약(REVIEW_SORT)에서 읽는다 — 목록을 손으로 적으면 다섯 번째 탭이
 * 생겨도 여기는 모른다.
 */
const SCHEMA = readFileSync(
  join(process.cwd(), '..', '..', 'packages', 'db', 'prisma', 'schema.prisma'),
  'utf8',
);

/** 그 정렬이 줄을 세우는 첫 칸 — queries/reviews.ts 의 orderFor 와 같은 값이어야 한다 */
const SORT_COLUMN: Readonly<Record<ReviewSort, string>> = {
  recent: 'createdAt',
  helpful: 'helpfulCount',
  rating_desc: 'rating',
  rating_asc: 'rating',
};

/** Review 모델 안에 선언된 복합 인덱스들 */
const reviewModel = /model Review \{([\s\S]*?)\n\}/.exec(SCHEMA)?.[1] ?? '';

describe('리뷰 정렬 인덱스', () => {
  it('스키마에서 Review 모델을 실제로 찾았다', () => {
    expect(reviewModel).toContain('@@map("reviews")');
  });

  it('정렬마다 짝이 정해져 있다 — 탭이 늘면 여기서 먼저 걸린다', () => {
    expect(Object.keys(SORT_COLUMN).sort()).toEqual([...REVIEW_SORT].sort());
  });

  it.each(REVIEW_SORT)('%s 정렬에 쓸 인덱스가 있다', (sort) => {
    const column = SORT_COLUMN[sort];
    expect(
      reviewModel.includes(`@@index([productId, ${column}])`),
      `${sort} 정렬은 productId + ${column} 로 세우는데 그 인덱스가 없다 — ` +
        '한 상품의 리뷰를 전부 읽어 메모리에서 세우게 된다.',
    ).toBe(true);
  });
});
