import Link from 'next/link';
import { REVIEW_SORT, type ReviewSort } from '@shop/contract';
import { getT } from '~/lib/i18n/server';
import { REVIEW_SORT_KEY } from '~/lib/i18n/review-sort';

/**
 * 리뷰 정렬.
 *
 * **평범한 링크다.** 조건이 주소에 남아야 공유하고 뒤로 갈 수 있고,
 * 자바스크립트가 없어도 동작한다 — 목록 정렬과 같은 규칙이다.
 *
 * 정렬을 바꾸면 화면 맨 위로 올라가 버리므로 **리뷰 자리로 돌아오게**
 * 조각 식별자를 붙인다. 상품 상세는 길어서, 위로 튕기면 방금 무엇을 눌렀는지
 * 알 수 없다.
 */
export async function ReviewSortTabs({
  sort,
  basePath,
}: {
  sort: ReviewSort;
  /** 지금 상품의 경로. 정렬을 바꿔도 이 화면으로 돌아온다. */
  basePath: `/product/${string}`;
}) {
  const t = await getT();

  return (
    <nav aria-label={t('review.sort')} className="mt-8">
      <ul className="flex flex-wrap gap-x-1">
        {REVIEW_SORT.map((value) => {
          const current = value === sort;
          return (
            <li key={value}>
              <Link
                href={{
                  pathname: basePath,
                  query: { reviewSort: value },
                  // 정렬을 누르면 리뷰 자리로 돌아온다
                  hash: 'reviews-title',
                }}
                // 지금 보고 있는 정렬을 색이 아니라 이름으로 알린다
                aria-current={current ? 'true' : undefined}
                className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] no-underline ${
                  current
                    ? 'bg-[var(--surface-2)] font-medium text-[var(--fg)]'
                    : 'text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                }`}
              >
                {t(REVIEW_SORT_KEY[value])}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
