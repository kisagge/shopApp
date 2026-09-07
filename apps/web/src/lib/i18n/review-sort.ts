import type { ReviewSort } from '@shop/contract';
import type { MessageKey } from '@shop/i18n';

/**
 * 정렬 이름표.
 *
 * 계약은 어떤 정렬이 있는지만 정하고 뭐라고 부를지는 화면이 정한다.
 * 예전에는 계약 옆에 한국어 표가 있었는데, 그러면 계약이 한국어 전용이 된다.
 */
export const REVIEW_SORT_KEY: Record<ReviewSort, MessageKey> = {
  recent: 'review.sortRecent',
  helpful: 'review.sortHelpful',
  rating_desc: 'review.sortRatingDesc',
  rating_asc: 'review.sortRatingAsc',
};
