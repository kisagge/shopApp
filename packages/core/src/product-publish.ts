import type { Permission } from './authz';
import type { MerchantStatus } from './merchant-application';

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
 * 이 상품이 지금 **매대에 서 있는가.**
 *
 * 스토어프론트 질의는 `onDisplay()` + `sellableBrand()` 한 쌍으로 거르는데,
 * 손에 이미 행을 쥐고 같은 판단을 해야 하는 자리가 셋 있다 — 재입고 알림 신청,
 * 기획전 편집 화면의 "매대에 있음" 표시, 운영 상품 검색의 같은 표시.
 * 셋이 각자 조건을 적어 두었더니 **하나가 다른 답을 냈다**: 상태를 `DRAFT`·`HIDDEN`
 * 만 빼는 식으로 적어서 **검수 대기 중인 상품에 재입고 알림을 걸 수 있었다.**
 * 매대에는 없는 상품인데 "들어오면 알려 드립니다" 를 약속한 셈이다.
 *
 * 같은 목록을 두 번 적지 않게, 판단은 여기서 한 번만 한다.
 *
 * 가맹점 상태는 **자사 직매입이면 null** 이다 — 승인을 물을 상대가 없다.
 */
export function isOnDisplay(input: {
  readonly deletedAt: Date | null;
  readonly publishedAt: Date | null;
  readonly status: ProductStatus;
  /** 이 브랜드를 파는 가맹점의 상태. 자사 브랜드면 null */
  readonly merchantStatus: MerchantStatus | null;
}): boolean {
  return (
    input.deletedAt === null &&
    input.publishedAt !== null &&
    isVisibleStatus(input.status) &&
    // 가맹점을 정지시켰는데 상품이 계속 서 있으면 처분이 처분이 아니다
    (input.merchantStatus === null || input.merchantStatus === 'APPROVED')
  );
}

/**
 * **팔 쪽으로 간 상태** — 매대에 보이거나, 매대로 가려고 줄을 선 것.
 *
 * 검수 대기를 여기 넣은 이유가 있다. 검수는 **운영진이 승인만 하면 곧바로 매대에 서는 자리**라,
 * 그때 막으면 막히는 사람(운영진)과 고칠 수 있는 사람(그 가맹점)이 갈린다 — 운영진은 기다리는 수밖에
 * 없고, 가맹점은 왜 승인이 안 나는지 모른다. 줄을 설 때 막으면 둘이 같은 사람이다.
 */
export const SALE_BOUND_STATUS: readonly ProductStatus[] = ['PENDING_REVIEW', ...VISIBLE_STATUS];

export function isSaleBound(status: ProductStatus): boolean {
  return SALE_BOUND_STATUS.includes(status);
}

/**
 * **돌려받을 곳이 없으면 팔 수 없다.**
 *
 * 반품지가 없는 판매처의 상품도 매대에 올라갔다. 팔리고 나서 손님이 반품을 신청하면 그제서야 드러나는데
 * (승인을 누르려다 막힌다), 그때는 이미 늦다 — 물건은 손님 집에 있고 신청은 대기열에 갇힌다. 애초에
 * 돌려받을 곳이 있을 때만 팔 수 있게 한다.
 *
 * **올라가는 길목에서만 묻는다.** "지금 반품지가 있는가" 로 두면 반품지가 없는 옛 가맹점은 이미 팔고
 * 있는 상품의 설명 한 줄도 못 고치게 된다 — 그건 이 규칙이 막으려던 일이 아니다.
 */
export function needsReturnAddressFor(input: {
  readonly from: ProductStatus;
  readonly to: ProductStatus | undefined;
}): boolean {
  if (input.to === undefined) return false;
  return isSaleBound(input.to) && !isSaleBound(input.from);
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
  RETURN_ADDRESS_REQUIRED:
    '반품지를 먼저 등록해 주세요. 돌려받을 곳이 없으면 매대에 올릴 수 없습니다 — 팔린 뒤에 반품 신청이 들어와도 승인할 수 없습니다.',
} as const;
