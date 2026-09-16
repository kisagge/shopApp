import { z } from 'zod';
import {
  CATEGORY_SLUG_PATTERN, CATEGORY_SLUG_MIN, CATEGORY_SLUG_MAX, CATEGORY_NAME_MAX,
} from '@shop/core';

/**
 * 카테고리 만들기·고치기·순서 바꾸기.
 *
 * 주소 규칙은 브랜드·기획전과 같다 — 한글도 대문자도 받지 않는다.
 */
const slug = z
  .string()
  .trim()
  .min(CATEGORY_SLUG_MIN, 'valid.slugFormat')
  .max(CATEGORY_SLUG_MAX, 'valid.tooLongChars')
  .regex(CATEGORY_SLUG_PATTERN, 'valid.slugFormat');

const name = z
  .string()
  .trim()
  .min(1, 'valid.nameRequired')
  .max(CATEGORY_NAME_MAX, 'valid.tooLongChars');

export const createCategorySchema = z.object({
  name,
  slug,
  /** 부모. 최상위로 둘 것이면 null */
  parentId: z.string().nullable().default(null),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: name.optional(),
  slug: slug.optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/**
 * 같은 부모 안에서의 순서.
 *
 * **부모를 함께 받는다.** id 만 받으면 서로 다른 부모의 자식이 한 묶음으로 섞여
 * 들어올 수 있고, 그러면 한쪽 갈래의 순서가 조용히 뒤집힌다.
 */
export const reorderCategorySchema = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1, 'valid.tooFewItems').max(50, 'valid.tooManyItems'),
});
export type ReorderCategoryInput = z.infer<typeof reorderCategorySchema>;

export const CATEGORY_ERROR = [
  'CATEGORY_NOT_FOUND',
  'SLUG_TAKEN',
  'NAME_TAKEN',
  'TOO_DEEP',
  'PARENT_HAS_PRODUCTS',
  'CYCLE',
  'CATEGORY_NOT_EMPTY',
] as const;
export type CategoryErrorCode = (typeof CATEGORY_ERROR)[number];

export const CATEGORY_ERROR_MESSAGE: Readonly<Record<CategoryErrorCode, string>> = {
  CATEGORY_NOT_FOUND: '카테고리를 찾을 수 없습니다',
  SLUG_TAKEN: '이미 쓰고 있는 주소입니다',
  NAME_TAKEN: '같은 갈래 안에 같은 이름이 있습니다',
  TOO_DEEP: '두 단까지만 만들 수 있습니다. 매대가 그 아래는 그리지 않습니다',
  PARENT_HAS_PRODUCTS: '상품이 붙어 있는 갈래 밑에는 만들 수 없습니다. 상품을 먼저 옮겨 주세요',
  CYCLE: '자기 자신이나 그 아래로는 옮길 수 없습니다',
  CATEGORY_NOT_EMPTY: '상품이나 하위 갈래가 남아 있어 지울 수 없습니다',
};
