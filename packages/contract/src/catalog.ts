import { z } from 'zod';
import { PRODUCT_SORT, MAX_SEARCH_LENGTH } from '@shop/core';

/**
 * 목록 조회 조건.
 *
 * 주소창에서 오는 값이라 전부 문자열이고, 사용자가 손으로 고칠 수 있다.
 * 잘못된 값은 **거절하지 않고 기본값으로 되돌린다** — 링크를 잘못 받았다고
 * 오류 화면을 띄우면 아무것도 못 한다.
 */
export const catalogQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).optional(),
  sort: z.enum(PRODUCT_SORT).catch('recommended'),
  minPrice: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
  maxPrice: z.coerce.number().int().min(0).max(100_000_000).optional().catch(undefined),
  /** 커서 페이지네이션. 마지막으로 본 상품 id */
  cursor: z.string().optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
