import { describe, it, expect } from 'vitest';
import { isCurrentNav } from '~/lib/admin/nav-path';

/**
 * 운영 메뉴가 **지금 어디인지** 말하는 규칙.
 *
 * 사이드바 스무 칸이 전부 똑같이 그려지고 있었다 — 표시도 `aria-current` 도 없이.
 * `usePathname()` 은 이미 읽고 있었지만 드롭다운을 여닫는 데만 썼다. 화면 서른두 장짜리
 * 콘솔에서 내가 어느 화면에 있는지를 메뉴가 한 번도 말해 주지 않았다.
 */

describe('지금 보고 있는 메뉴', () => {
  it('같은 주소면 그 칸이다', () => {
    expect(isCurrentNav('/admin/orders', '/admin/orders')).toBe(true);
  });

  /** 주문 하나를 열면 주소가 아래로 들어간다. 그때 '주문' 이 꺼지면 메뉴 밖으로 나온 것처럼 보인다 */
  it.each([
    ['/admin/orders/20261013-7565428', '/admin/orders'],
    ['/admin/products/new', '/admin/products'],
    ['/admin/merchants/m-1/settings', '/admin/merchants'],
  ])('%s 는 %s 아래다', (pathname, href) => {
    expect(isCurrentNav(pathname, href)).toBe(true);
  });

  /*
   * **대시보드만 예외다.** `/admin` 은 모든 운영 주소의 앞자락이라, 아래까지 쳐 주면 어느
   * 화면에 있든 대시보드가 함께 켜져 둘이 같이 빛난다.
   */
  it.each([
    '/admin/orders',
    '/admin/products/new',
    '/admin/traffic',
  ])('%s 에서 대시보드는 켜지지 않는다', (pathname) => {
    expect(isCurrentNav(pathname, '/admin')).toBe(false);
  });

  it('대시보드 자신일 때는 켜진다', () => {
    expect(isCurrentNav('/admin', '/admin')).toBe(true);
  });

  /** 앞자락이 같다고 같은 메뉴가 아니다 — `/admin/order` 와 `/admin/orders` 는 다른 곳이다 */
  it.each([
    ['/admin/orders-archive', '/admin/orders'],
    ['/admin/productsx', '/admin/products'],
  ])('%s 는 %s 가 아니다 — 글자만 겹친 것이다', (pathname, href) => {
    expect(isCurrentNav(pathname, href)).toBe(false);
  });

  it('남의 메뉴는 켜지지 않는다', () => {
    expect(isCurrentNav('/admin/orders', '/admin/products')).toBe(false);
  });

  /** 켜지는 칸은 하나여야 한다 — 둘이 빛나면 아무 말도 안 하는 것과 같다 */
  it('어느 주소에서든 켜지는 칸이 하나를 넘지 않는다', () => {
    const menu = [
      '/admin', '/admin/orders', '/admin/returns', '/admin/products',
      '/admin/settlements', '/admin/users', '/admin/merchants', '/admin/traffic',
    ];

    for (const pathname of [...menu, '/admin/orders/20261013-1', '/admin/products/new']) {
      const lit = menu.filter((href) => isCurrentNav(pathname, href));
      expect(lit, `${pathname} 에서 ${lit.join(', ')} 가 함께 켜졌다`).toHaveLength(1);
    }
  });
});
