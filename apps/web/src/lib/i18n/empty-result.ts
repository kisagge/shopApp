import type { EmptyResultReason } from '@shop/core';
import type { MessageKey } from '@shop/i18n';

/**
 * core 가 판단한 이유를 문구로 잇는다.
 *
 * 이 표가 여기 있는 이유는 core 가 언어를 모르기 때문이다. 이유는 규칙이고
 * 문구는 화면이다.
 */
export const EMPTY_RESULT_KEY: Record<EmptyResultReason, MessageKey> = {
  widen_price: 'empty.widen_price',
  widen_category: 'empty.widen_category',
  widen_both: 'empty.widen_both',
  widen_filters: 'empty.widen_filters',
  widen_price_filters: 'empty.widen_price_filters',
  other_term: 'empty.other_term',
  no_products: 'empty.no_products',
};
