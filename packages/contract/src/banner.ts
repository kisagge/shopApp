import { z } from 'zod';
import { BANNER_TONE } from '@shop/core';

/**
 * 홈 배너 계약.
 *
 * 링크는 **내부 경로만** 받는다. 운영자 계정이 하나라도 털리면 홈 최상단
 * 배너가 외부 사이트로 가는 링크가 되는데, 그건 우리 도메인을 빌려준 피싱이다.
 */

/**
 * 막아야 하는 것은 **오리진 탈출**이지 문자 종류가 아니다.
 * `/search?q=코트` 같은 한글 질의는 정상적인 내부 링크다.
 *
 * - `/` 로 시작해야 한다 (`https://`, `javascript:` 차단)
 * - 두 번째 글자가 `/` 나 `\` 면 안 된다 — `//evil.test` 는 프로토콜 상대
 *   URL 이라 외부로 나가고, 일부 파서는 `\` 를 `/` 로 취급한다
 * - 제어문자는 받지 않는다 (헤더·로그 오염)
 */
const internalPath = z
  .string()
  .trim()
  .max(200, 'valid.tooLongChars')
  // eslint-disable-next-line no-control-regex
  .regex(/^\/(?![/\\])[^\u0000-\u001f\\]*$/, 'valid.internalPathOnly');

const dateInput = z
  .union([z.iso.datetime({ offset: true }), z.iso.datetime(), z.literal('')])
  .nullable()
  .transform((v) => (v === '' || v === null ? null : new Date(v)));

const bannerShape = {
  eyebrow: z.string().trim().max(40, 'valid.tooLongChars').nullable(),
  headline: z.string().trim().min(1, 'valid.titleRequired').max(60, 'valid.tooLongChars'),
  subcopy: z.string().trim().max(200, 'valid.tooLongChars').nullable(),
  ctaLabel: z.string().trim().max(20, 'valid.tooLongChars').nullable(),
  href: internalPath.nullable(),
  tone: z.enum(BANNER_TONE),
  isActive: z.boolean(),
  startsAt: dateInput,
  endsAt: dateInput,
};

/** 버튼 문구와 링크는 짝이다. 하나만 있으면 누를 수 없거나 어디로 가는지 모른다. */
// exactOptionalPropertyTypes 아래에서는 선택 속성에 undefined 를 명시해야
// 부분 갱신 스키마의 refine 인자와 맞는다.
const ctaPaired = (v: {
  ctaLabel?: string | null | undefined;
  href?: string | null | undefined;
}): boolean => (v.ctaLabel ?? null) === null || (v.href ?? null) !== null;

const windowOrdered = (v: {
  startsAt?: Date | null | undefined;
  endsAt?: Date | null | undefined;
}): boolean => !v.startsAt || !v.endsAt || v.startsAt.getTime() < v.endsAt.getTime();

export const createBannerSchema = z
  .object({
    ...bannerShape,
    eyebrow: bannerShape.eyebrow.default(null),
    subcopy: bannerShape.subcopy.default(null),
    ctaLabel: bannerShape.ctaLabel.default(null),
    href: bannerShape.href.default(null),
    tone: bannerShape.tone.default('sand'),
    isActive: bannerShape.isActive.default(true),
    // 기간은 대개 비워 둔다. 기본값이 없으면 "필수" 가 되어 정상 입력도 거절된다.
    startsAt: bannerShape.startsAt.default(null),
    endsAt: bannerShape.endsAt.default(null),
  })
  .refine(ctaPaired, { message: 'valid.ctaNeedsHref', path: ['href'] })
  .refine(windowOrdered, { message: 'valid.endBeforeStart', path: ['endsAt'] });
export type CreateBannerInput = z.infer<typeof createBannerSchema>;

/** 기본값을 붙이지 않는다 — .partial() 은 .default() 를 걷어내지 않는다. */
export const updateBannerSchema = z
  .object(bannerShape)
  .partial()
  .refine(ctaPaired, { message: 'valid.ctaNeedsHref', path: ['href'] })
  .refine(windowOrdered, { message: 'valid.endBeforeStart', path: ['endsAt'] });
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;

export const reorderBannerSchema = z.object({
  orderedIds: z.array(z.string()).min(1, 'valid.tooFewItems').max(20, 'valid.tooManyItems'),
});

export const BANNER_ERROR = ['BANNER_NOT_FOUND', 'TOO_MANY_BANNERS'] as const;
export type BannerErrorCode = (typeof BANNER_ERROR)[number];

export const BANNER_ERROR_MESSAGE: Readonly<Record<BannerErrorCode, string>> = {
  BANNER_NOT_FOUND: '배너를 찾을 수 없습니다',
  TOO_MANY_BANNERS: '배너는 6개까지 만들 수 있습니다',
};
