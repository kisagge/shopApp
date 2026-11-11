// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from './render';
import userEvent from '@testing-library/user-event';

const path = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => path.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const { MobileMenu } = await import('~/components/mobile-menu');

/**
 * 좁은 화면의 헤더 메뉴. **단위 검사가 한 줄도 없었다**(문장 29개 전부).
 *
 * 이 조각의 뼈대가 흔한 모양이 아니다 — 열림을 boolean 이 아니라 **여는 순간의
 * 경로**로 들고 있다. 지금 경로와 같을 때만 열린 것으로 보므로 **페이지를 옮기는
 * 것이 곧 닫힘**이고, 이펙트에서 닫지 않아 이동마다 렌더가 한 번 더 돌지 않는다.
 * 영리한 만큼 조용히 망가지기 쉬운 자리다.
 *
 * `<details>` 로 만들었다가 버린 까닭도 여기 함께 못 박는다 — summary 가 이름도
 * 역할도 없이 노출되지 않았다. 지금은 역할과 상태를 단추가 직접 말한다.
 */

const CATEGORIES = [
  { slug: 'outer', name: '아웃터' },
  { slug: 'knit', name: '니트' },
];

const menu = (user: Parameters<typeof MobileMenu>[0]['user'] = null) =>
  render(<MobileMenu categories={CATEGORIES} user={user} />);

const trigger = () => screen.getByRole('button', { name: '메뉴' });
const panel = () => document.getElementById('mobile-menu-panel')!;

beforeEach(() => {
  path.current = '/';
});

describe('열고 닫기', () => {
  it('처음에는 닫혀 있고, 단추가 무엇을 여는지 말한다', () => {
    menu();

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).toHaveAttribute('aria-controls', 'mobile-menu-panel');
    expect(panel()).toHaveAttribute('hidden');
  });

  it('누르면 열리고 다시 누르면 닫힌다', async () => {
    menu();
    await userEvent.click(trigger());

    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).not.toHaveAttribute('hidden');

    await userEvent.click(trigger());
    expect(panel()).toHaveAttribute('hidden');
  });

  it('페이지를 옮기면 닫힌다 — 열어 둔 메뉴가 새 화면을 덮으면 안 된다', () => {
    /*
     * 열림을 **여는 순간의 경로**로 들고 있어서 이동 자체가 닫힘이다. 이펙트에서
     * 닫으면 이동마다 렌더가 한 번 더 돈다.
     */
    const { rerender } = menu();
    trigger().click();
    rerender(<MobileMenu categories={CATEGORIES} user={null} />);
    expect(panel()).not.toHaveAttribute('hidden');

    path.current = '/category/outer';
    rerender(<MobileMenu categories={CATEGORIES} user={null} />);

    expect(panel()).toHaveAttribute('hidden');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('같은 경로로 다시 그려도 열린 채로 있다 — 이동이 아니면 닫지 않는다', () => {
    const { rerender } = menu();
    trigger().click();
    rerender(<MobileMenu categories={[...CATEGORIES, { slug: 'bag', name: '가방' }]} user={null} />);

    expect(panel()).not.toHaveAttribute('hidden');
  });
});

describe('키보드와 바깥 누르기', () => {
  it('Escape 로 닫고 초점을 단추로 되돌린다 — 아니면 처음부터 다시 찾는다', async () => {
    menu();
    await userEvent.click(trigger());
    within(panel()).getAllByRole('link')[0]!.focus();

    await userEvent.keyboard('{Escape}');

    expect(panel()).toHaveAttribute('hidden');
    expect(document.activeElement).toBe(trigger());
  });

  it('닫혀 있을 때 Escape 는 아무것도 하지 않는다 — 듣는 자리를 걷어 둔다', async () => {
    /*
     * 닫혔으면 이펙트가 일찍 빠져나가 키를 듣지 않는다. 그 가드가 없으면 메뉴를
     * 쓰지도 않는 사람의 Escape 가 초점을 이 단추로 끌어온다.
     */
    render(
      <>
        <button type="button">바깥 단추</button>
        <MobileMenu categories={CATEGORIES} user={null} />
      </>,
    );
    const outside = screen.getByRole('button', { name: '바깥 단추' });
    outside.focus();

    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).toBe(outside);
  });

  it('닫은 뒤에는 듣던 자리를 걷는다 — 남아 있으면 남의 Escape 가 초점을 끌어온다', async () => {
    /*
     * **열었다 닫은 뒤가 아니면 드러나지 않는다.** 한 번도 안 열었으면 애초에
     * 듣지 않으므로(`if (!open) return`), 걷어 내는 쪽은 열고 닫아 봐야 보인다.
     */
    render(
      <>
        <button type="button">바깥 단추</button>
        <MobileMenu categories={CATEGORIES} user={null} />
      </>,
    );
    await userEvent.click(trigger());
    await userEvent.click(trigger());

    const outside = screen.getByRole('button', { name: '바깥 단추' });
    outside.focus();
    await userEvent.keyboard('{Escape}');

    expect(document.activeElement).toBe(outside);
  });

  it('바깥을 누르면 닫힌다', async () => {
    menu();
    await userEvent.click(trigger());

    await userEvent.pointer({ target: document.body, keys: '[MouseLeft]' });

    expect(panel()).toHaveAttribute('hidden');
  });

  it('메뉴 안을 누르는 것은 바깥이 아니다', async () => {
    menu();
    await userEvent.click(trigger());

    await userEvent.click(within(panel()).getByRole('combobox'));

    expect(panel()).not.toHaveAttribute('hidden');
  });
});

describe('안에 든 것', () => {
  it('검색은 GET 폼이라 자바스크립트 없이도 된다', () => {
    menu();
    const form = within(panel()).getByRole('search', { hidden: true });

    expect(form).toHaveAttribute('method', 'get');
    expect(form).toHaveAttribute('action', '/search');
  });

  it('닫혀 있어도 안의 것은 DOM 에 남는다 — 접근성 트리에서만 빠진다', () => {
    /*
     * `hidden` 이라 낭독기에는 안 보이지만 **폼은 문서에 있다.** 자바스크립트가
     * 없는 브라우저에서 검색이 되는 까닭이 그것이고, 그려 두지 않고 열 때 만들면
     * 그 길이 사라진다.
     */
    menu();

    expect(panel()).toHaveAttribute('hidden');
    expect(screen.queryByRole('search')).toBeNull();
    expect(within(panel()).getByRole('search', { hidden: true })).toBeInTheDocument();
    expect(within(panel()).getAllByRole('listitem', { hidden: true })).toHaveLength(
      CATEGORIES.length + 1,
    );
  });

  it('받은 카테고리를 순서대로 걸고, 기획전은 뒤에 따로 둔다', () => {
    menu();
    const nav = within(panel()).getByRole('navigation', { hidden: true });
    const links = within(nav).getAllByRole('link', { hidden: true });

    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/category/outer',
      '/category/knit',
      '/collections',
    ]);
  });

  it('아이콘은 장식이고 이름은 단추가 말한다', () => {
    menu();
    const icon = trigger().querySelector('svg')!;

    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(trigger()).toHaveAccessibleName('메뉴');
  });

  it('열면 아이콘 모양이 바뀐다 — 닫는 자리임을 눈으로도 안다', async () => {
    menu();
    const closed = trigger().querySelector('svg path')!.getAttribute('d');

    await userEvent.click(trigger());
    const opened = trigger().querySelector('svg path')!.getAttribute('d');

    expect(opened).not.toBe(closed);
  });

  it('세션 쪽은 받은 사람을 그대로 흘려 보낸다', () => {
    menu({ id: 'u-1', name: '장씨', role: 'CUSTOMER' });

    expect(within(panel()).getByText('장씨')).toBeInTheDocument();
  });
});
