import type { Permission } from './authz';

/**
 * 상품 게시 규칙. 순수 로직만, I/O 없음.
 *
 * `product:publish` 는 권한 표에 있었지만 **어디서도 검사하지 않았다.**
 * 게다가 가맹점도 그 권한을 갖고 있어서, 검사를 넣어도 아무것도 달라지지
 * 않는 상태였다 — 구분하지 않는 권한은 없는 권한과 같다.
 *
 * 여기서 두 가지를 정한다: 무엇이 게시이고, 누가 게시할 수 있는가.
 */

export const PRODUCT_STATUS = ['DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SOLD_OUT', 'HIDDEN'] as const;
export type ProductStatus = (typeof PRODUCT_STATUS)[number];

export const PRODUCT_STATUS_LABEL: Readonly<Record<ProductStatus, string>> = {
  DRAFT: '작성 중',
  PENDING_REVIEW: '검수 대기',
  ACTIVE: '판매중',
  SOLD_OUT: '품절',
  HIDDEN: '숨김',
};

/**
 * 매대에 보이는 상태.
 *
 * 스토어프론트 조회와 **같은 목록이어야 한다.** 조회는
 * `status in (ACTIVE, SOLD_OUT) and publishedAt is not null` 로 거른다.
 * 여기가 그것과 어긋나면, 권한 검사는 통과하는데 화면에는 뜨는(또는 그 반대)
 * 상태가 생긴다.
 */
export const VISIBLE_STATUS: readonly ProductStatus[] = ['ACTIVE', 'SOLD_OUT'];

export function isVisibleStatus(status: ProductStatus): boolean {
  return VISIBLE_STATUS.includes(status);
}

/**
 * 이 상태 변경에 게시 권한이 필요한가.
 *
 * **최초 게시만 검수를 받는다.** 한 번 통과한 상품을 가맹점이 잠시 내렸다가
 * 다시 올리는 것까지 막으면, 품절 처리나 사진 교체 때마다 운영진을 기다려야
 * 한다. 그건 검수가 아니라 발목이다. 심사는 "이 상품이 이 매대에 어울리는가"
 * 를 한 번 보는 것이고, 그 판단은 다시 내렸다 올린다고 달라지지 않는다.
 *
 * 그래서 기준은 `publishedAt` 이다 — 게시된 적이 있으면 검수는 끝난 것이다.
 */
export function needsPublishPermission(input: {
  readonly to: ProductStatus;
  /** 지금까지 한 번이라도 게시된 적이 있는가 */
  readonly publishedAt: Date | null;
}): boolean {
  if (!isVisibleStatus(input.to)) return false;
  return input.publishedAt === null;
}

export const PUBLISH_PERMISSION: Permission = 'product:publish';

/**
 * 가맹점이 스스로 고를 수 있는 상태.
 *
 * 검수를 요청하는 길(PENDING_REVIEW)이 없으면 가맹점은 작성만 하고 아무에게도
 * 알릴 수 없다. 권한을 뺐으면 대신 요청할 문을 열어 줘야 한다.
 */
export const MERCHANT_SELECTABLE_STATUS: readonly ProductStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'HIDDEN',
];

/** 검수 대기줄에 올라와 있는가 */
export function isAwaitingReview(status: ProductStatus): boolean {
  return status === 'PENDING_REVIEW';
}

export const PUBLISH_ERROR = {
  PUBLISH_NOT_ALLOWED: '상품을 매대에 올리는 것은 운영진이 확인한 뒤에 됩니다. 검수를 요청해 주세요.',
  NOT_AWAITING_REVIEW: '검수를 기다리는 상품이 아닙니다.',
  REJECT_REASON_REQUIRED: '반려 사유를 적어 주세요.',
} as const;
export type PublishErrorCode = keyof typeof PUBLISH_ERROR;
