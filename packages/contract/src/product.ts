import { z } from 'zod';
import {
  PRODUCT_STATUS as CORE_PRODUCT_STATUS,
  PRODUCT_STATUS_LABEL as CORE_PRODUCT_STATUS_LABEL,
  type ProductStatus as CoreProductStatus,
  PUBLISH_ERROR,
} from '@shop/core';
import { cuidSchema, wonSchema } from './common';

/**
 * 상품 등록·수정 계약.
 *
 * 판매가는 정가보다 클 수 없고, 슬러그는 URL 에 그대로 들어가므로 형식을 제한한다.
 */

/**
 * 상태 목록은 **core 하나만 본다.**
 *
 * 여기 따로 적어 두었더니 core 에 상태를 더할 때 이쪽이 남았다. 그러면
 * 계약이 통과시키는 값과 정책이 아는 값이 갈라지고, 갈라진 줄은 아무도
 * 모른다 — 이 작업이 고치려는 결함과 같은 모양이다.
 */
export const PRODUCT_STATUS = CORE_PRODUCT_STATUS;
export type ProductStatusInput = CoreProductStatus;
export const PRODUCT_STATUS_LABEL = CORE_PRODUCT_STATUS_LABEL;

const slugSchema = z
  .string()
  .trim()
  .min(2, 'valid.tooShortChars')
  .max(80, 'valid.tooLongChars')
  // URL 에 그대로 들어간다. 한글·공백·대문자를 허용하면 인코딩된 주소가 되고
  // 공유했을 때 읽을 수 없다.
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'valid.slugFormat');

/**
 * 상품 필드. **기본값을 여기 두지 않는다.**
 *
 * 부분 수정 스키마는 이 모양에 .partial() 을 씌워 만드는데, Zod 의 .partial()
 * 은 .default() 를 걷어내지 않는다. 기본값을 여기 두면 이름만 고치는 요청에도
 * `salePrice: null`, `description: ''` 이 딸려 들어가 **보내지 않은 필드가
 * 조용히 지워진다.** 기본값은 등록 스키마에만 붙인다.
 */
const productShape = {
  slug: slugSchema,
  name: z.string().trim().min(1, 'valid.productNameRequired').max(120, 'valid.tooLongChars'),
  description: z.string().trim().max(4000, 'valid.tooLongChars'),
  brandId: cuidSchema,
  categoryId: cuidSchema,
  listPrice: wonSchema,
  /** null 이면 할인 없이 정가로 판다 */
  salePrice: wonSchema.nullable(),
  status: z.enum(PRODUCT_STATUS),
};

const priceRule = {
  check: (v: { listPrice: number; salePrice: number | null }) =>
    v.salePrice === null || v.salePrice <= v.listPrice,
  message: 'valid.salePriceOverList',
  path: ['salePrice'] as const,
};

export const createProductSchema = z
  .object({
    ...productShape,
    description: productShape.description.default(''),
    salePrice: productShape.salePrice.default(null),
  })
  .refine(priceRule.check, { message: priceRule.message, path: [...priceRule.path] });
export type CreateProductInput = z.infer<typeof createProductSchema>;

/** 수정은 부분 갱신을 허용한다. 보내지 않은 필드는 그대로 둔다. */
export const updateProductSchema = z.object(productShape).partial().refine(
  (v) =>
    v.listPrice === undefined ||
    v.salePrice === undefined ||
    v.salePrice === null ||
    v.salePrice <= v.listPrice,
  { message: priceRule.message, path: [...priceRule.path] },
);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** 재고는 상품과 따로 고친다. 가격 수정과 재고 조정은 성격이 다른 일이다. */
export const updateStockSchema = z.object({
  variants: z
    .array(
      z.object({
        variantId: cuidSchema,
        stock: z.int().min(0, 'valid.stockMin').max(999_999, 'valid.tooBig'),
        isActive: z.boolean().optional(),
      }),
    )
    .min(1, 'valid.tooFewItems')
    .max(200, 'valid.tooManyItems'),
});
export type UpdateStockInput = z.infer<typeof updateStockSchema>;

/**
 * 옵션(변형) 추가.
 *
 * 옵션이 하나도 없는 상품은 살 수 없다. 등록 직후 반드시 하나는 만들어야 하므로
 * 재고 조정과 별개의 계약으로 둔다.
 */
export const createVariantSchema = z.object({
  // SKU 는 창고·정산에서 사람이 읽고 옮겨 적는 값이다. 대소문자가 섞이면
  // 같은 물건이 두 개로 갈린다.
  sku: z
    .string()
    .trim()
    .min(2, 'valid.tooShortChars')
    .max(64, 'valid.tooLongChars')
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, 'valid.upperSlugFormat'),
  optionLabel: z.string().trim().min(1, 'valid.optionNameRequired').max(60, 'valid.tooLongChars'),
  stock: z.int().min(0, 'valid.stockMin').max(999_999, 'valid.tooBig').default(0),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const PRODUCT_ERROR = [
  'SLUG_TAKEN', 'BRAND_NOT_ALLOWED', 'PRODUCT_NOT_FOUND', 'CATEGORY_NOT_FOUND', 'SKU_TAKEN',
  'PUBLISH_NOT_ALLOWED', 'NOT_AWAITING_REVIEW', 'REJECT_REASON_REQUIRED',
] as const;
export type ProductErrorCode = (typeof PRODUCT_ERROR)[number];

export const PRODUCT_ERROR_MESSAGE: Readonly<Record<ProductErrorCode, string>> = {
  SLUG_TAKEN: '이미 사용 중인 슬러그입니다',
  BRAND_NOT_ALLOWED: '이 브랜드에 상품을 등록할 권한이 없습니다',
  PRODUCT_NOT_FOUND: '상품을 찾을 수 없습니다',
  CATEGORY_NOT_FOUND: '카테고리를 찾을 수 없습니다',
  SKU_TAKEN: '이미 사용 중인 SKU 입니다',
  PUBLISH_NOT_ALLOWED: PUBLISH_ERROR.PUBLISH_NOT_ALLOWED,
  NOT_AWAITING_REVIEW: PUBLISH_ERROR.NOT_AWAITING_REVIEW,
  REJECT_REASON_REQUIRED: PUBLISH_ERROR.REJECT_REASON_REQUIRED,
};

/** 게시 검수 결정 */
export const reviewProductSchema = z.object({
  approve: z.boolean(),
  /** 반려할 때만 쓴다. 승인에는 필요 없다. */
  reason: z.string().trim().max(500, 'valid.tooLongChars').nullable().default(null),
});
export type ReviewProductInput = z.infer<typeof reviewProductSchema>;

/**
 * 재고 일괄 수정 — 내려받은 재고 파일을 고쳐 올린다.
 *
 * 1MB 면 옵션 수만 줄이다. 그보다 크면 재고 파일이 아니라 다른 파일을 고른 것이다.
 */
export const bulkStockSchema = z.object({
  csv: z.string().min(1, 'valid.fileRequired').max(1_000_000, 'valid.tooLongChars'),
});
export type BulkStockInput = z.infer<typeof bulkStockSchema>;
