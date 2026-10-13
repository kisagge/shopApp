/**
 * 운영 메뉴에서 **지금 어디인지** 를 가린다.
 *
 * 사이드바 스무 칸이 전부 똑같이 그려지고 있었다 — 표시도 `aria-current` 도 없이.
 * `usePathname()` 은 이미 읽고 있었지만 드롭다운을 여닫는 데만 썼다. 화면 서른두 장짜리
 * 콘솔에서 **내가 어느 화면에 있는지를 메뉴가 한 번도 말해 주지 않는다.**
 *
 * **아래로 들어간 화면도 그 메뉴다.** 주문 하나를 열면 주소가 `/admin/orders/2026…` 이 되는데,
 * 그때 '주문' 이 꺼지면 "메뉴 밖으로 나왔다" 로 읽힌다.
 *
 * **대시보드만 예외다.** `/admin` 은 모든 운영 주소의 앞자락이라, 아래까지 쳐 주면 어느
 * 화면에 있든 대시보드가 켜져 둘이 함께 빛난다.
 */
export function isCurrentNav(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === '/admin') return false;
  return pathname.startsWith(`${href}/`);
}
