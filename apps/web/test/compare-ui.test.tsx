// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_COMPARE } from '@shop/core';
import { render, screen } from './render';
import { useCompare } from '~/stores/compare';
import { CompareToggle } from '~/components/compare-toggle';
import { CompareTray } from '~/components/compare-tray';

const path = vi.hoisted(() => ({ now: '/category/outer-coat' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.now }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  // AppLink 가 이 훅을 쓴다 — 흉내 낼 때 빠뜨리면 링크를 그리는 순간 터진다
  useLinkStatus: () => ({ pending: false }),
}));

const coat = (n: number) => ({ slug: `coat-${n}`, categorySlug: 'outer-coat', name: `코트 ${n}` });

beforeEach(() => {
  useCompare.setState({ items: [] });
  path.now = '/category/outer-coat';
});

describe('비교 담기', () => {
  it('체크박스다 — 눌러 보지 않아도 담겼는지 보인다', async () => {
    render(<CompareToggle {...coat(1)} />);

    const box = screen.getByRole('checkbox', { name: /코트 1/ });
    expect(box).not.toBeChecked();

    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['coat-1']);
  });

  /** 스무 개가 모두 '비교' 로 읽히면 낭독기 사용자는 어느 상품 것인지 모른다 */
  it('이름으로 구분된다', () => {
    render(
      <>
        <CompareToggle {...coat(1)} />
        <CompareToggle {...coat(2)} />
      </>,
    );

    expect(screen.getByRole('checkbox', { name: /코트 1/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /코트 2/ })).toBeInTheDocument();
  });

  /**
   * 담을 수 없을 때 이 자리가 비어 버리면, 사람은 자기가 무엇을 잘못했는지
   * 모른 채 기능이 없어졌다고 여긴다.
   */
  it('다른 갈래면 사라지지 않고 잠긴다 — 이유와 함께', () => {
    useCompare.setState({ items: [coat(1)] });
    render(<CompareToggle slug="knit-1" categorySlug="knit-crewneck" name="니트" />);

    const box = screen.getByRole('checkbox', { name: /니트/ });
    expect(box).toBeDisabled();
    expect(screen.getByText(/같은 갈래/)).toBeInTheDocument();
  });

  it('가득 차면 잠기고, 몇 개까지인지 말해 준다', () => {
    useCompare.setState({ items: Array.from({ length: MAX_COMPARE }, (_, i) => coat(i)) });
    render(<CompareToggle {...coat(99)} />);

    expect(screen.getByRole('checkbox', { name: /코트 99/ })).toBeDisabled();
    expect(screen.getByText(new RegExp(`${MAX_COMPARE}개까지`))).toBeInTheDocument();
  });

  it('가득 차도 이미 담긴 것은 잠기지 않는다', () => {
    useCompare.setState({ items: Array.from({ length: MAX_COMPARE }, (_, i) => coat(i)) });
    render(<CompareToggle {...coat(0)} />);

    expect(screen.getByRole('checkbox', { name: /코트 0/ })).toBeEnabled();
  });
});

describe('비교함 띠', () => {
  /**
   * 빈 띠가 화면 아래를 늘 차지하면, 쓰지 않는 사람에게는 그냥 잘려 나간 화면이 된다.
   *
   * **알림 자리만 남는다.** 다 비우면 띠가 통째로 사라지는데, 알림 자리까지 함께 지우면 방금 채운 글을
   * 낭독기가 놓친다 — 눌렀는데 아무 일도 없던 것과 같아진다(최근 본 상품이 같은 이유로 자리를 늘 둔다).
   */
  it('담아 둔 것이 없으면 보이는 것이 없고, 알림 자리만 남는다', () => {
    const { container } = render(<CompareTray />);

    expect(container.querySelector('aside'), '빈 띠가 남아 있다').toBeNull();
    const live = container.querySelector('[role="status"]');
    expect(live, '알림 자리가 사라졌다 — 비웠다는 말을 할 곳이 없다').not.toBeNull();
    expect(live).toHaveClass('sr-only');
  });

  it('하나만 담아도 남되, 견주기는 잠긴다 — 눌렀는지조차 모르게 하지 않는다', () => {
    useCompare.setState({ items: [coat(1)] });
    render(<CompareTray />);

    expect(screen.getByText('코트 1')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /견주어 보기/ })).not.toBeInTheDocument();
    expect(screen.getByText(/2개 이상/)).toBeInTheDocument();
  });

  it('둘 이상이면 담은 차례대로 주소를 만든다', () => {
    useCompare.setState({ items: [coat(2), coat(1)] });
    render(<CompareTray />);

    expect(screen.getByRole('link', { name: /견주어 보기/ })).toHaveAttribute(
      'href',
      '/compare?slugs=coat-2,coat-1',
    );
  });

  it('띠에서 하나씩 뺄 수 있다', async () => {
    useCompare.setState({ items: [coat(1), coat(2)] });
    render(<CompareTray />);

    await userEvent.click(screen.getByRole('button', { name: /코트 1/ }));
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['coat-2']);
  });

  /**
   * **뺀 칩은 자기 단추와 함께 사라진다.** 챙기지 않으면 초점이 body 로 떨어져, 셋을 빼려면 문서 맨 앞에서
   * 탭으로 세 번 내려와야 한다. 목록을 왼쪽에서 오른쪽으로 지워 나가는 동작이 끊기지 않게 옆 칩으로 옮긴다.
   */
  it('칩을 빼면 초점이 옆 칩으로 간다', async () => {
    useCompare.setState({ items: [coat(1), coat(2)] });
    render(<CompareTray />);

    await userEvent.click(screen.getByRole('button', { name: /코트 1/ }));

    expect(document.activeElement, '초점이 문서 처음으로 떨어졌다').toBe(
      screen.getByRole('button', { name: /코트 2/ }),
    );
  });

  it('무엇을 뺐는지 알린다 — 칩이 사라지는 것은 눈으로만 보이는 변화다', async () => {
    useCompare.setState({ items: [coat(1), coat(2)] });
    const { container } = render(<CompareTray />);

    await userEvent.click(screen.getByRole('button', { name: /코트 1/ }));

    expect(container.querySelector('[role="status"]')?.textContent).toContain('코트 1');
  });

  /**
   * **비우면 띠가 통째로 사라진다.** 낭독기 쪽에는 눌렀는데 아무 일도 안 일어난 것과 같다 — 그래서 알림
   * 자리를 띠 바깥에 두고, 비운 뒤에도 그 말이 남아 있어야 한다.
   */
  it('비우면 비웠다고 말한다', async () => {
    useCompare.setState({ items: [coat(1), coat(2)] });
    const { container } = render(<CompareTray />);

    await userEvent.click(screen.getByRole('button', { name: '비우기' }));

    expect(screen.queryByRole('complementary', { name: '비교함' })).toBeNull();
    expect(container.querySelector('[role="status"]')?.textContent).toBe('비교함을 비웠습니다');
  });

  it('띠는 보조 영역으로 이름이 붙어 있다 — 본문과 구분되어야 건너뛸 수 있다', () => {
    useCompare.setState({ items: [coat(1)] });
    render(<CompareTray />);

    expect(screen.getByRole('complementary', { name: '비교함' })).toBeInTheDocument();
  });
});

/**
 * 사는 흐름에서는 비교함을 띄우지 않는다.
 *
 * **폰에서 주문을 못 하고 있었다.** 장바구니의 `주문하기` 막대는 z-index 가
 * 없고 비교함은 z-40 이라, 비교함에 뭔가 담아 둔 사람에게는 띠가 버튼을
 * 통째로 덮었다 — 버튼 한가운데를 짚으면 비교함의 '빼기' 가 잡혔다.
 * 결제 화면에서는 그 131px 이 키보드 위 공간까지 먹어, 받는 사람 칸과의
 * 여유가 1px 이었다.
 */
describe('사는 흐름에서는 비교함이 없다', () => {
  const 담기 = () => useCompare.setState({ items: [coat(1), coat(2)] });

  it('장바구니에서는 그리지 않는다', () => {
    담기();
    path.now = '/cart';
    render(<CompareTray />);
    expect(screen.queryByRole('complementary', { name: '비교함' })).toBeNull();
  });

  it('결제 화면에서도 그리지 않는다', () => {
    담기();
    path.now = '/checkout';
    render(<CompareTray />);
    expect(screen.queryByRole('complementary', { name: '비교함' })).toBeNull();
  });

  it('결제 아래 화면에서도 그리지 않는다 — /checkout/fail 같은 곳', () => {
    담기();
    path.now = '/checkout/fail';
    render(<CompareTray />);
    expect(screen.queryByRole('complementary', { name: '비교함' })).toBeNull();
  });

  it('고르는 화면에서는 그대로 뜬다 — 숨기는 것이 번지면 안 된다', () => {
    담기();
    path.now = '/category/outer-coat';
    render(<CompareTray />);
    expect(screen.getByRole('complementary', { name: '비교함' })).toBeInTheDocument();
  });

  it('이름이 비슷한 다른 화면까지 숨기지 않는다', () => {
    담기();
    path.now = '/cartoon';
    render(<CompareTray />);
    expect(screen.getByRole('complementary', { name: '비교함' })).toBeInTheDocument();
  });
});
