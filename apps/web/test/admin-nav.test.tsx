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

/**
 * **좁은 화면의 메뉴 — 열고 닫는 길이 셋이다.**
 *
 * 운영 화면 서른두 장을 오가는 유일한 통로인데, 좁은 화면에서는 그 통로가 서랍 뒤에 있다.
 * 열고 **닫는 길**이 비어 있었다 — 파일의 절반이 안 돈 줄이었다(16/30).
 *
 * 닫는 길이 셋인 까닭이 있다: 닫기 단추(손), `Escape`(키보드), 바깥 누르기(손). 하나라도
 * 없으면 그 방식으로 쓰는 사람이 **갇힌다** — 특히 키보드만 쓰는 사람에게 `Escape` 가 없으면
 * 서랍 안을 끝까지 훑어야 빠져나온다.
 *
 * **닫은 뒤 초점을 여는 단추로 돌려준다.** 안 돌려주면 초점이 문서 처음으로 튀어, 키보드
 * 사용자는 방금 있던 자리를 처음부터 다시 찾는다.
 */
describe('좁은 화면의 메뉴', () => {
  const openMenu = async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<AdminNav items={ITEMS} roleLabel="운영진" merchant={false} theme="system" />);
    const trigger = screen.getByRole('button', { name: '관리자 메뉴 열기' });
    await user.click(trigger);
    return { user, trigger };
  };

  it('여는 단추가 상태를 말한다', async () => {
    const { trigger } = await openMenu();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: '관리자 메뉴 닫기' })).toBeInTheDocument();
  });

  it('닫기 단추로 닫으면 초점이 여는 단추로 돌아온다', async () => {
    const { user, trigger } = await openMenu();

    await user.click(screen.getByRole('button', { name: '관리자 메뉴 닫기' }));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('Escape 로도 닫히고 초점이 돌아온다 — 키보드만 쓰는 사람이 갇히지 않는다', async () => {
    const { user, trigger } = await openMenu();
    /*
     * **초점을 서랍 안으로 먼저 옮긴다.** 여는 단추에 그대로 두면 "돌려줬는지" 를 가릴 수
     * 없다 — 아무것도 안 해도 그 단추에 있다. 돌연변이로 그것을 확인하고 고쳤다.
     */
    screen.getByRole('button', { name: '관리자 메뉴 닫기' }).focus();

    await user.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('다른 키는 닫지 않는다 — 메뉴 안에서 글자를 누를 수도 있다', async () => {
    const { user, trigger } = await openMenu();

    await user.keyboard('a');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('바깥을 누르면 닫힌다', async () => {
    const { user, trigger } = await openMenu();

    await user.click(document.body);

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  /** 안을 누르면 열려 있어야 한다 — 바깥 판정이 너무 넓으면 메뉴를 쓸 수 없다 */
  it('메뉴 안을 누르면 열려 있다', async () => {
    const { user, trigger } = await openMenu();

    await user.click(screen.getByRole('link', { name: '주문' }));

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
});
