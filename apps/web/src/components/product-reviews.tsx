import type { ReviewSort } from '@shop/contract';
import { getReviewSummary, getProductReviews } from '~/lib/queries/reviews';
import { ReviewSection } from './review-section';
import { ReviewSortTabs } from './review-sort-tabs';
import { getT } from '~/lib/i18n/server';
import { SIZE_FIT_KEY } from '~/lib/i18n/enum-labels';

/**
 * 리뷰를 읽어 와 그리는 자리.
 *
 * ReviewSection 은 값을 받아 그리기만 한다 — 그래야 테스트에서 그릴 수 있다.
 * **조회를 그쪽에 넣지 않고 이 껍데기를 따로 두는 이유가 그것이고**, 덕분에
 * 이 조각만 Suspense 로 감쌀 수 있다.
 */
export async function ProductReviews({
  productId,
  slug,
  viewerId,
  loggedIn,
  sort,
}: {
  productId: string;
  slug: string;
  viewerId: string | undefined;
  loggedIn: boolean;
  sort: ReviewSort;
}) {
  const [t, summary, reviews] = await Promise.all([
    getT(),
    getReviewSummary(productId),
    getProductReviews(productId, { viewerId, sort }),
  ]);

  return (
    <ReviewSection
      summary={summary}
      reviews={reviews.items}
      sortTabs={<ReviewSortTabs sort={sort} basePath={`/product/${slug}`} />}
      loggedIn={loggedIn}
      sizeFitLabel={(fit) => t(SIZE_FIT_KEY[fit])}
      t={t}
    />
  );
}
