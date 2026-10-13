// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';

const pathname = vi.hoisted(() => ({ value: '/admin/orders' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock('next/link', () => ({
  // 흉내는 `useLinkStatus` 까지 내놔야 한다 — 없으면 링크를 그리는 순간 터진다(link-mock)
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useLinkStatus: () => linkStatus,
}));
vi.mock('~/components/admin-sign-out', () => ({ AdminSignOut: () => null }));
vi.mock('~/components/theme-switcher', () => ({ ThemeSwitcher: () => null }));

const { AdminNav } = await import('~/components/admin/admin-nav');

/**
 * 운영 메뉴 — 화면 서른두 장을 오가는 **유일한 통로.**
 *
 * 둘이 비어 있었다. **지금 어디인지 한 번도 말하지 않았고**(활성 표시도 `aria-current` 도
 * 없이 스무 칸이 똑같이 그려졌다), 눌러 놓고 기다리는 동안 **아무 일도 안 일어났다**.
 * 운영 화면은 전부 force-dynamic 이라 이 앱에서 가장 느린데, 매장 쪽에만 이동 표시가 있었다.
 */

const ITEMS = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/orders', label: '주문' },
  { href: '/admin/products', label: '상품' },
] as const;

const open = (at: string) => {
  pathname.value = at;
  return render(
    <AdminNav items={ITEMS} roleLabel="운영진" merchant={false} theme="system" />,
  );
};

const menu = () => screen.getAllByRole('navigation', { name: '관리자 메뉴' })[0]!;
const link = (label: string) => within(menu()).getAllByRole('link', { name: new RegExp(label) })[0]!;

describe('지금 어디인지 말한다', () => {
  it('보고 있는 칸에 표를 붙인다 — 색만으로 말하지 않는다', () => {
    open('/admin/orders');

    expect(link('주문')).toHaveAttribute('aria-current', 'page');
  });

  it('나머지 칸에는 안 붙인다', () => {
    open('/admin/orders');

    expect(link('상품')).not.toHaveAttribute('aria-current');
    expect(link('대시보드')).not.toHaveAttribute('aria-current');
  });

  /** 주문 하나를 열면 주소가 아래로 들어간다. 그때 '주문' 이 꺼지면 메뉴 밖으로 나온 것처럼 보인다 */
  it('아래로 들어간 화면에서도 그 칸이 켜져 있다', () => {
    open('/admin/orders/20261013-7565428');

    expect(link('주문')).toHaveAttribute('aria-current', 'page');
  });

  /** 둘이 빛나면 아무 말도 안 하는 것과 같다 */
  it('켜지는 칸은 언제나 하나다', () => {
    for (const at of ['/admin', '/admin/orders', '/admin/products/new']) {
      open(at);
      const lit = within(menu())
        .getAllByRole('link')
        .filter((a) => a.getAttribute('aria-current') === 'page');
      expect(lit, at).toHaveLength(1);
      screen.getAllByRole('navigation').forEach(() => undefined);
      document.body.innerHTML = '';
    }
  });
});

/**
 * **누른 자리에서 곧바로 알린다.** 운영 화면은 전부 force-dynamic 이라 이 앱에서 가장 느리다 —
 * 누르고 1초 넘게 아무 변화가 없으면 누른 사람은 안 눌린 줄 알고 다른 칸을 누른다.
 */
describe('눌러 놓고 기다리는 동안', () => {
  it('이동 중이면 누른 칸에 표시가 뜬다', () => {
    linkStatus.pending = true;
    try {
      open('/admin/orders');

      expect(link('상품').querySelector('.link-busy')).not.toBeNull();
    } finally {
      linkStatus.pending = false;
    }
  });

  it('이동 중이 아니면 아무것도 안 그린다 — 늘 뜨는 표시는 읽히지 않는다', () => {
    open('/admin/orders');

    expect(link('상품').querySelector('.link-busy')).toBeNull();
  });
});
