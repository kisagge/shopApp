import { z } from 'zod';
import { BRAND_SLUG_PATTERN, BRAND_SLUG_MIN, BRAND_SLUG_MAX, BRAND_NAME_MAX } from '@shop/core';

/**
 * 브랜드 만들기·고치기.
 *
 * 주소 규칙은 기획전과 같다 — 한글도 대문자도 받지 않는다. 인코딩된 주소는
 * 공유될 때 알아볼 수 없게 되고, 대소문자가 섞이면 같은 곳이 둘로 보인다.
 */
const slug = z
  .string()
  .trim()
  .min(BRAND_SLUG_MIN, 'valid.slugFormat')
  .max(BRAND_SLUG_MAX, 'valid.tooLongChars')
  .regex(BRAND_SLUG_PATTERN, 'valid.slugFormat');

const name = z.string().trim().min(1, 'valid.nameRequired').max(BRAND_NAME_MAX, 'valid.tooLongChars');

/*
 * **로고는 여기서 다루지 않는다.** 브랜드 화면이 logoUrl 을 그리기는 하는데
 * 채우는 길이 없다 — 주소를 손으로 받게 하면 매대에 남의 서버 이미지가 걸리고,
 * 그쪽이 지워지면 깨진 그림이 남는다. 이미지 올리는 길을 붙일 때 함께 연다.
 */
export const createBrandSchema = z.object({ name, slug });
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = z.object({
  name: name.optional(),
  slug: slug.optional(),
});
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export const BRAND_ERROR = ['BRAND_NOT_FOUND', 'SLUG_TAKEN', 'NAME_TAKEN', 'BRAND_NOT_ALLOWED'] as const;
export type BrandErrorCode = (typeof BRAND_ERROR)[number];

export const BRAND_ERROR_MESSAGE: Readonly<Record<BrandErrorCode, string>> = {
  BRAND_NOT_FOUND: '브랜드를 찾을 수 없습니다',
  SLUG_TAKEN: '이미 쓰고 있는 주소입니다',
  NAME_TAKEN: '이미 쓰고 있는 이름입니다',
  BRAND_NOT_ALLOWED: '이 브랜드를 고칠 수 없습니다',
};
