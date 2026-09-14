/**
 * 권한 정책.
 *
 * 화면(어드민 메뉴 노출)과 서버(라우트 가드) 양쪽이 같은 규칙을 봐야 한다.
 * 한쪽에만 규칙이 있으면 메뉴는 안 보이는데 URL로 직접 치면 되는 구멍이 생긴다.
 *
 * 두 층으로 나뉜다.
 * 1) **역할이 가진 권한** — hasPermission. "가맹점은 상품을 쓸 수 있다"
 * 2) **그 대상이 자기 것인가** — canManageProduct 등. "그런데 남의 브랜드는 안 된다"
 * 1번만 통과시키면 가맹점이 남의 상품을 고칠 수 있다. 항상 둘 다 본다.
 */

export const USER_ROLE = ['CUSTOMER', 'MERCHANT', 'ADMIN', 'SUPER_ADMIN'] as const;
export type UserRole = (typeof USER_ROLE)[number];

export const USER_ROLE_LABEL: Readonly<Record<UserRole, string>> = {
  CUSTOMER: '고객',
  MERCHANT: '가맹점',
  ADMIN: '관리자',
  SUPER_ADMIN: '슈퍼관리자',
};

export interface Actor {
  readonly id: string;
  readonly role: UserRole;
  /** MERCHANT 일 때만 채워진다. 이 값이 볼 수 있는 범위를 정한다. */
  readonly merchantId: string | null;
}

export const PERMISSION = [
  'admin:access',       // 어드민 콘솔 진입
  'product:read',
  'product:write',
  'product:publish',
  'order:read',
  'order:fulfill',      // 배송 준비 → 배송중
  'order:cancel',
  'order:refund',       // 돈이 나가는 동작
  /*
   * **반품 신청을 승인·반려하고, 돌아온 물건을 확인한다.** 돈은 움직이지 않는다.
   *
   * 반품된 물건을 받는 곳은 가맹점 창고다. 운영진이 승인하고 회수까지 확인하게 두면 운영진은
   * 물건을 본 적도 없이 "도착했다" 를 누르고, 가맹점은 자기 상품이 돌아오는지 알 길이 없다.
   * 판단과 확인은 물건 곁에 있는 사람이 한다. 돈을 내보내는 환불(order:refund)은 운영진에게
   * 남긴다 — 가맹점이 자기 상품 반품에 스스로 돈을 돌려주면 권한을 나눈 뜻이 없다.
   */
  'return:resolve',
  'merchant:read',
  'merchant:write',
  'merchant:approve',   // 입점 승인
  'user:read',
  'user:write',
  'user:assignRole',    // 권한 부여
  'coupon:read',
  'coupon:write',
  // 홈 배너는 플랫폼 진열이다. 가맹점이 만지면 남의 매대를 바꾸는 셈이 된다.
  'banner:read',
  'banner:write',
  // 기획전도 같은 이유로 플랫폼의 것이다. 여러 브랜드를 가로질러 고르는
  // 자리라, 한 가맹점이 고르면 자기 상품만 담거나 경쟁 브랜드를 뺀다.
  'collection:read',
  'collection:write',
  'settlement:read',
  'settlement:confirm', // 정산 금액 확정
  'settlement:pay',     // 실제 지급 집행
  'review:write',
  /*
   * **읽는 것과 내리는 것을 가른다.**
   *
   * 가맹점은 자기 상품의 평을 볼 수 있어야 한다 — 파는 사람이 자기 물건이
   * 어떤 소리를 듣는지 모르면 고칠 수가 없다. 문의는 답까지 하게 해 두었으면서
   * 리뷰는 보지도 못하는 상태였다.
   *
   * 내리는 것은 다르다. 자기 상품의 혹평을 내릴 수 있으면 리뷰가 상품 설명의
   * 일부가 된다. 그래서 `review:moderate` 는 운영진에게만 남긴다.
   */
  'review:read',
  'review:moderate',
  // 상품 문의에 답한다. 가맹점은 자기 상품만.
  'inquiry:answer',
  // 공지와 FAQ 를 쓴다. **가맹점에게 주지 않는다** — 고객센터의 글은 한
  // 브랜드가 아니라 이 가게 전체의 말이고, 배송·환불 정책은 플랫폼이 정한다.
  'support:write',
  /*
   * 배송비 정책. **가맹점에게 주지 않는다** — 배송비는 한 브랜드가 아니라
   * 이 가게 전체의 약속이고, 무료 기준 하나가 모든 주문의 금액을 바꾼다.
   * 공지와 FAQ 를 플랫폼이 쓰는 것과 같은 이유다.
   */
  'shipping:write',
  /*
   * 알림 문구. **가맹점에게 주지 않는다** — 손님에게 가는 알림은 가게 전체의 말투이고, 재고 부족 알림은 가맹점이
   * 받는 쪽이다. 받는 사람이 자기에게 오는 문구를 고칠 까닭이 없다.
   */
  'notification:write',
  // 전체 트래픽 지표. 가맹점은 자기 매출만 보고 플랫폼 전체 방문·전환은 못 본다 —
  // 다른 가맹점의 성과를 역산할 수 있는 값이다.
  'analytics:all',
] as const;
export type Permission = (typeof PERMISSION)[number];

const CUSTOMER: readonly Permission[] = ['product:read', 'order:read', 'review:write'];

/**
 * 가맹점에게 **product:publish 가 없다.**
 *
 * 처음에는 갖고 있었는데, 그러면 product:write 와 아무것도 구분하지 못한다 —
 * 쓸 수 있는 사람이 곧 올릴 수 있는 사람이라 권한을 둘로 나눈 뜻이 없어진다.
 * PLAIN 은 한 매대에 여러 브랜드를 올리는 큐레이션 몰이고, 무엇이 그 매대에
 * 오르는지는 플랫폼이 정한다. 입점 자체를 승인으로 거르면서 상품은 아무나
 * 올릴 수 있으면 앞뒤가 맞지 않는다.
 *
 * 대신 요청하는 길을 준다 — 가맹점은 상태를 PENDING_REVIEW 로 올리고,
 * 운영진이 그것을 보고 게시한다(product-publish 의 MERCHANT_SELECTABLE_STATUS).
 * 검수는 **최초 게시 한 번**이다. 그 뒤로는 가맹점이 직접 내리고 올린다.
 */
const MERCHANT: readonly Permission[] = [
  'admin:access',
  'product:read', 'product:write',
  'order:read', 'order:fulfill',
  // 자기 상품의 반품을 승인·반려하고 회수를 확인한다. 환불은 못 한다
  'return:resolve',
  'merchant:read', 'merchant:write',
  'settlement:read',
  // 자기 상품의 평을 읽는다. 내리지는 못한다 — review:moderate 주석을 보라.
  'review:read',
  // 자기 상품에 들어온 문의에 답한다. 답할 사람이 파는 사람인 것이 맞다.
  'inquiry:answer',
];

/**
 * 관리자에게 없는 것 셋 — 권한 부여, 가맹점 입점 승인, 정산 지급 집행.
 * 계정을 만들어 스스로 권한을 올리거나 돈을 빼는 경로를 한 사람이 완결하지
 * 못하게 나눈 것이다.
 */
const ADMIN: readonly Permission[] = [
  'admin:access',
  'product:read', 'product:write', 'product:publish',
  'order:read', 'order:fulfill', 'order:cancel', 'order:refund', 'return:resolve',
  'merchant:read', 'merchant:write',
  'user:read', 'user:write',
  'coupon:read', 'coupon:write',
  'banner:read', 'banner:write',
  'collection:read', 'collection:write',
  'settlement:read', 'settlement:confirm',
  'review:write', 'review:read', 'review:moderate',
  'inquiry:answer', 'support:write', 'shipping:write', 'notification:write',
  'analytics:all',
];

const SUPER_ADMIN: readonly Permission[] = PERMISSION;

const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  CUSTOMER, MERCHANT, ADMIN, SUPER_ADMIN,
};

export class ForbiddenError extends Error {
  constructor(readonly actor: Actor, readonly permission: Permission) {
    super(`${USER_ROLE_LABEL[actor.role]}에게는 ${permission} 권한이 없습니다.`);
    this.name = 'ForbiddenError';
  }
}

export const permissionsOf = (role: UserRole): readonly Permission[] => ROLE_PERMISSIONS[role];

export function hasPermission(actor: Actor, permission: Permission): boolean {
  // 가맹점인데 소속이 없으면 아무 범위도 없다. 안전한 쪽으로 닫는다.
  if (actor.role === 'MERCHANT' && actor.merchantId === null) return false;
  return ROLE_PERMISSIONS[actor.role].includes(permission);
}

export function assertPermission(actor: Actor, permission: Permission): void {
  if (!hasPermission(actor, permission)) throw new ForbiddenError(actor, permission);
}

// ── 범위 판정 ────────────────────────────────────────────────

const isStaff = (actor: Actor): boolean =>
  actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';

/** 그 가맹점의 데이터를 다룰 수 있는가 */
export function ownsMerchant(actor: Actor, merchantId: string | null): boolean {
  if (isStaff(actor)) return true;
  if (actor.role !== 'MERCHANT' || actor.merchantId === null) return false;
  return actor.merchantId === merchantId;
}

/**
 * 상품을 고칠 수 있는가.
 * merchantId 가 null 인 상품은 자사 직매입이라 운영진만 다룬다.
 */
/**
 * **범위 제한은 조회에서 건다.**
 *
 * 예전에는 여기에 canViewOrder·canFulfillOrderItem·canViewSettlement 가 있었는데
 * 앱에서 한 번도 부르지 않았다. 앱은 행을 읽어 놓고 판정하지 않고, 애초에
 * where 절로 남의 것을 빼고 읽는다 — 그쪽이 더 안전하다. 읽고 나서 막는
 * 방식은 어딘가에서 그 한 줄을 빠뜨리면 그대로 새고, 실수해도 눈에 띄지
 * 않는다.
 *
 * 여기 있으면서 아무도 쓰지 않는 판정 함수는 **읽는 사람을 속인다** —
 * 주문 접근이 이 함수를 거치는 줄 알게 된다. 그래서 지웠다.
 * 실제 범위 제한은 lib/queries/admin.ts 와 lib/orders/* 의 where 절에 있고,
 * 권한 자체는 각 조회가 assertPermission 으로 확인한다.
 */
export function canManageProduct(actor: Actor, product: { merchantId: string | null }): boolean {
  return hasPermission(actor, 'product:write') && ownsMerchant(actor, product.merchantId);
}



/** 환불은 돈이 나가는 동작이라 가맹점에게 주지 않는다 */
export function canRefundOrder(actor: Actor): boolean {
  return hasPermission(actor, 'order:refund');
}


/**
 * 권한을 부여할 수 있는가.
 * 자기 자신의 역할은 바꾸지 못한다 — 스스로 강등해 감사 흔적을 지우거나,
 * 실수로 마지막 슈퍼관리자를 없애는 일을 막는다.
 */
export function canAssignRole(actor: Actor, target: { id: string }, _newRole: UserRole): boolean {
  if (!hasPermission(actor, 'user:assignRole')) return false;
  return actor.id !== target.id;
}

/**
 * 다른 사용자 계정을 수정할 수 있는가.
 * 관리자는 슈퍼관리자 계정을 건드리지 못한다.
 */
export function canEditUser(actor: Actor, target: { id: string; role: UserRole }): boolean {
  if (!hasPermission(actor, 'user:write')) return false;
  if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') return false;
  return true;
}

/**
 * 목록 쿼리에 붙일 가맹점 범위.
 * null 이면 제한 없음(운영진), 문자열이면 그 가맹점으로 좁힌다.
 * undefined 면 볼 수 있는 게 없다.
 */
export function merchantScope(actor: Actor): string | null | undefined {
  if (isStaff(actor)) return null;
  if (actor.role === 'MERCHANT' && actor.merchantId !== null) return actor.merchantId;
  return undefined;
}

/**
 * 이 반품 신청을 처리(승인·반려·회수 확인)할 수 있는가.
 *
 * **가맹점은 신청한 줄이 전부 자기 상품일 때만.** 한 주문에 두 가맹점 상품이 섞였고 신청이
 * 둘 다 돌려보내는 것이면, 한 가맹점이 승인하는 순간 남의 상품 반품까지 승인한 셈이 된다.
 * 그런 신청은 운영진이 처리한다. 신청한 줄이 없으면(알 수 없으면) 닫는다.
 */
export function canResolveReturnOf(
  actor: Actor,
  lineMerchantIds: readonly (string | null)[],
): boolean {
  if (!hasPermission(actor, 'return:resolve')) return false;
  if (isStaff(actor)) return true;
  return lineMerchantIds.length > 0 && lineMerchantIds.every((id) => id !== null && id === actor.merchantId);
}

/**
 * 이 회원의 이용을 정지(또는 해제)할 수 있는가.
 *
 * - 회원 관리 권한(user:write)이 있어야 한다.
 * - **자기 자신은 못 한다.** 스스로를 막으면 풀어 줄 사람을 찾아야 하고, 그건 막으려던 게 아니라 실수다.
 * - **운영진 계정은 슈퍼관리자만.** 관리자가 다른 관리자를 막을 수 있으면 권한 다툼이 그대로 계정 잠금이
 *   된다. 가맹점·손님 계정은 관리자도 막는다.
 */
export function canSuspendUser(
  actor: Actor,
  target: { readonly id: string; readonly role: UserRole },
): 'OK' | 'FORBIDDEN' | 'SELF' | 'STAFF' {
  if (!hasPermission(actor, 'user:write')) return 'FORBIDDEN';
  if (actor.id === target.id) return 'SELF';
  if ((target.role === 'ADMIN' || target.role === 'SUPER_ADMIN') && actor.role !== 'SUPER_ADMIN') return 'STAFF';
  return 'OK';
}
