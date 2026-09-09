import { z } from 'zod';
import { BANNER_TONE, COLLECTION_SLUG_PATTERN, MAX_COLLECTION_ITEMS } from '@shop/core';

/**
 * 기획전 계약.
 *
 * 톤은 배너와 같은 목록을 쓴다. 같은 팔레트에서 고르는 값이라 목록을 따로
 * 두면 한쪽에만 색이 늘어나고, 그 어긋남은 화면에서야 드러난다.
 */

const dateInput = z
  .union([z.iso.datetime({ offset: true }), z.iso.datetime(), z.literal('')])
  .nullable()
  .transform((v) => (v === '' || v === null ? null : new Date(v)));

/**
 * 주소에 그대로 들어가는 값이라 좁게 받는다.
 *
 * 대문자와 공백을 받으면 같은 기획전이 여러 주소로 열려 검색엔진이 중복으로
 * 본다. 한글도 받지 않는다 — 인코딩된 주소는 공유될 때 알아볼 수 없게 된다.
 */
const slug = z
  .string()
  .trim()
  .min(2, 'valid.slugFormat')
  .max(60, 'valid.tooLongChars')
  .regex(COLLECTION_SLUG_PATTERN, 'valid.slugFormat');

const collectionShape = {
  slug,
  title: z.string().trim().min(1, 'valid.titleRequired').max(60, 'valid.tooLongChars'),
  subtitle: z.string().trim().max(120, 'valid.tooLongChars').nullable(),
  description: z.string().trim().max(600, 'valid.tooLongChars').nullable(),
  tone: z.enum(BANNER_TONE),
  isActive: z.boolean(),
  startsAt: dateInput,
  endsAt: dateInput,
};

const windowOrdered = (v: {
  startsAt?: Date | null | undefined;
  endsAt?: Date | null | undefined;
}): boolean => !v.startsAt || !v.endsAt || v.startsAt.getTime() < v.endsAt.getTime();

export const createCollectionSchema = z
  .object({
    ...collectionShape,
    subtitle: collectionShape.subtitle.default(null),
    description: collectionShape.description.default(null),
    tone: collectionShape.tone.default('sand'),
    isActive: collectionShape.isActive.default(true),
    startsAt: collectionShape.startsAt.default(null),
    endsAt: collectionShape.endsAt.default(null),
  })
  .refine(windowOrdered, { message: 'valid.endBeforeStart', path: ['endsAt'] });
export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;

export const updateCollectionSchema = z
  .object(collectionShape)
  .partial()
  .refine(windowOrdered, { message: 'valid.endBeforeStart', path: ['endsAt'] });
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;

/**
 * 담긴 상품 전체를 한 번에 보낸다.
 *
 * 하나씩 넣고 빼는 창구로 두면 순서를 바꿀 때마다 요청이 여러 번 나가고,
 * 중간에 하나가 실패하면 **화면과 저장된 순서가 갈라진다.** 편집은 통째로
 * 저장하는 편이 맞다. 빈 배열도 받는다 — 다 빼는 것도 편집이다.
 */
export const setCollectionItemsSchema = z.object({
  productIds: z
    .array(z.string().min(1, 'valid.idFormat'))
    .max(MAX_COLLECTION_ITEMS, 'valid.tooManyItems')
    .refine((ids) => new Set(ids).size === ids.length, { message: 'valid.duplicateItems' }),
});
export type SetCollectionItemsInput = z.infer<typeof setCollectionItemsSchema>;

export const reorderCollectionSchema = z.object({
  orderedIds: z.array(z.string()).min(1, 'valid.tooFewItems').max(50, 'valid.tooManyItems'),
});

export const COLLECTION_ERROR = [
  'COLLECTION_NOT_FOUND',
  'SLUG_TAKEN',
  'PRODUCT_NOT_FOUND',
] as const;
export type CollectionErrorCode = (typeof COLLECTION_ERROR)[number];

export const COLLECTION_ERROR_MESSAGE: Readonly<Record<CollectionErrorCode, string>> = {
  COLLECTION_NOT_FOUND: '기획전을 찾을 수 없습니다',
  SLUG_TAKEN: '이미 쓰고 있는 주소입니다',
  PRODUCT_NOT_FOUND: '없는 상품이 섞여 있습니다',
};
