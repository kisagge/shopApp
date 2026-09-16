import { hasPermission, type Actor } from './authz';

/**
 * 브랜드 관리 정책.
 *
 * **주소를 고칠 길이 없었다.** 입점 승인 때 브랜드를 자동으로 만드는데, 한글
 * 이름이면 라틴 문자가 남지 않아 주소가 `brand-a1b2c3d4` 가 된다. 그 자리의
 * 주석은 "나중에 가맹점이 직접 고칠 수 있다" 고 적어 두었지만, 고칠 화면도
 * API 도 없었다 — 시드 말고는 브랜드를 쓰는 곳이 아예 없었다.
 */

/** 주소 규칙. 기획전과 같다 — 한글·대문자·밑줄은 받지 않는다 */
export const BRAND_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const BRAND_SLUG_MIN = 2;
export const BRAND_SLUG_MAX = 60;
export const BRAND_NAME_MAX = 60;

export const isBrandSlug = (value: string): boolean =>
  value.length >= BRAND_SLUG_MIN && value.length <= BRAND_SLUG_MAX && BRAND_SLUG_PATTERN.test(value);

/**
 * 이 브랜드를 고칠 수 있는가.
 *
 * **가맹점은 자기 브랜드만.** 이름과 주소는 매대에 그대로 뜨는 값이라, 남의
 * 브랜드를 고칠 수 있으면 그 가게의 간판을 바꿔 다는 셈이 된다.
 *
 * 자사 브랜드(merchantId 가 없는 것)는 운영진의 것이다.
 */
export function canEditBrand(actor: Actor, brandMerchantId: string | null): boolean {
  if (!hasPermission(actor, 'product:write')) return false;
  if (actor.role === 'MERCHANT') return brandMerchantId !== null && brandMerchantId === actor.merchantId;
  return true;
}

/**
 * 브랜드를 새로 만들 수 있는가 — 운영진만.
 *
 * **가맹점에게는 열지 않는다.** 가맹점의 브랜드는 입점 승인 때 하나 생기고,
 * 그 하나가 그 가맹점의 간판이다. 스스로 더 만들 수 있게 하면 한 가맹점이
 * 여러 간판을 다는 셈이라 정산·범위 판단이 함께 흔들린다.
 */
export const canCreateBrand = (actor: Actor): boolean =>
  hasPermission(actor, 'product:write') && actor.role !== 'MERCHANT';
