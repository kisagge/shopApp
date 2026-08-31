import { z } from 'zod';
import { cuidSchema, wonSchema } from './common';

/**
 * 상품 등록·수정 계약.
 *
 * 판매가는 정가보다 클 수 없고, 슬러그는 URL 에 그대로 들어가므로 형식을 제한한다.
 */

export const PRODUCT_STATUS = ['DRAFT', 'ACTIVE', 'SOLD_OUT', 'HIDDEN'] as const;
export type ProductStatusInput = (typeof PRODUCT_STATUS)[number];

export const PRODUCT_STATUS_LABEL: Readonly<Record<ProductStatusInput, string>> = {
  DRAFT: '작성 중',
  ACTIVE: '판매중',
  SOLD_OUT: '품절',
  HIDDEN: '숨김',
};

const slugSchema = z
  .string()
  .trim()
  .min(2, '슬러그는 2자 이상이어야 합니다')
  .max(80)
  // URL 에 그대로 들어간다. 한글·공백·대문자를 허용하면 인코딩된 주소가 되고
  // 공유했을 때 읽을 수 없다.
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, '영소문자·숫자·하이픈만 쓸 수 있습니다');

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
  name: z.string().trim().min(1, '상품명을 입력해 주세요').max(120),
  description: z.string().trim().max(4000),
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
  message: '판매가가 정가보다 클 수 없습니다',
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
        stock: z.int().min(0, '재고는 0 이상이어야 합니다').max(999_999),
        isActive: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(200),
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
    .min(2, 'SKU 는 2자 이상이어야 합니다')
    .max(64)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, '영대문자·숫자·하이픈만 쓸 수 있습니다'),
  optionLabel: z.string().trim().min(1, '옵션명을 입력해 주세요').max(60),
  stock: z.int().min(0).max(999_999).default(0),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const PRODUCT_ERROR = [
  'SLUG_TAKEN', 'BRAND_NOT_ALLOWED', 'PRODUCT_NOT_FOUND', 'CATEGORY_NOT_FOUND', 'SKU_TAKEN',
] as const;
export type ProductErrorCode = (typeof PRODUCT_ERROR)[number];

export const PRODUCT_ERROR_MESSAGE: Readonly<Record<ProductErrorCode, string>> = {
  SLUG_TAKEN: '이미 사용 중인 슬러그입니다',
  BRAND_NOT_ALLOWED: '이 브랜드에 상품을 등록할 권한이 없습니다',
  PRODUCT_NOT_FOUND: '상품을 찾을 수 없습니다',
  CATEGORY_NOT_FOUND: '카테고리를 찾을 수 없습니다',
  SKU_TAKEN: '이미 사용 중인 SKU 입니다',
};
