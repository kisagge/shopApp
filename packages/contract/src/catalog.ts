import { z } from 'zod';
import {
  PRODUCT_SORT, MAX_SEARCH_LENGTH, normalizeFacetValues,
} from '@shop/core';

/**
 * 목록 조회 조건.
 *
 * 주소창에서 오는 값이라 전부 문자열이고, 사용자가 손으로 고칠 수 있다.
 * 잘못된 값은 **거절하지 않고 기본값으로 되돌린다** — 링크를 잘못 받았다고
 * 오류 화면을 띄우면 아무것도 못 한다.
 */
/**
 * 주소에서 온 값을 배열로 맞추고, 다듬고, 개수를 자른다.
 *
 * **자르는 것과 버리는 것은 다르다.** 예전에는 여기서 `.max(MAX_FACET_VALUES)`
 * 로 막았는데, Zod 의 max 는 넘치면 통째로 실패하고 그 실패를 아래 catch 가
 * 빈 배열로 삼켰다. 상품이 서른넷이 되어 사이즈 칩이 열둘 뜨자, 그걸 전부
 * 누른 사람은 조건 없는 목록과 빈 체크박스를 받았다 — 아무 일도 일어나지
 * 않은 것처럼 보인다.
 *
 * 개수를 자르는 일은 normalizeFacetValues 가 한다. 넘쳐도 앞의 것들은
 * 살아남으므로 화면이 조용히 초기화되지 않는다.
 *
 * 바깥 상한은 그대로 둔다. 주소에 값을 수천 개 붙여 파서를 밀어붙이는 것은
 * 사람이 아니라 장난이라, 그 자리에서는 버리는 것이 맞다.
 */
const RAW_LIMIT = 200;

const facetValues = z
  .preprocess(
    (raw) => (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw]),
    z.array(z.string().trim().min(1).max(30)).max(RAW_LIMIT),
  )
  .transform((values) => normalizeFacetValues(values))
  .catch([]);

export const catalogQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  sort: z.enum(PRODUCT_SORT).catch('recommended'),
  minPrice: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
  /** 커서 페이지네이션. 마지막으로 본 상품 id */
  cursor: z.string().optional(),
  /**
   * 색상·사이즈. 주소에 여러 번 붙을 수 있다 — `?size=M&size=L`.
   *
   * searchParams 는 값이 하나면 문자열, 여럿이면 배열로 준다. 그 차이를
   * 화면마다 다루면 한 곳에서 빠뜨리므로 **계약이 배열로 맞춰 준다.**
   * 잘못된 값이 와도 화면이 죽지 않게 빈 배열로 되돌린다(catch).
   */
  color: facetValues,
  size: facetValues,
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
