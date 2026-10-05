/**
 * 그 판매처의 **반품지를 등록하는 자리.**
 *
 * 가맹점 반품지는 그 가맹점 화면에서, 자사 상품을 받는 플랫폼 반품지는 배송 정책 화면에서 등록한다
 * (가게 전체의 약속이라 배송비와 같은 자리에 있다).
 *
 * 두 곳이 이 주소를 각자 적고 있었다 — "보낼 곳이 없다" 알림과 상품 폼의 안내. 한 곳만 고치면 알림을
 * 눌러 간 사람과 폼에서 눌러 간 사람이 서로 다른 화면에 도착한다.
 *
 * **서버 전용이 아니다.** 폼(클라이언트)도 같은 주소를 써야 한다.
 */
export function returnAddressPath(merchantId: string | null): string {
  return merchantId === null
    ? '/admin/shipping'
    : `/admin/merchants/${encodeURIComponent(merchantId)}/return-address`;
}