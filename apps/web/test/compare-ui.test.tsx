// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_COMPARE } from '@shop/core';
import { render, screen } from './render';
import { useCompare } from '~/stores/compare';
import { CompareToggle } from '~/components/compare-toggle';
import { CompareTray } from '~/components/compare-tray';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const coat = (n: number) => ({ slug: `coat-${n}`, categorySlug: 'outer-coat', name: `코트 ${n}` });

beforeEach(() => useCompare.setState({ items: [] }));

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
  it('담아 둔 것이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<CompareTray />);
    expect(container).toBeEmptyDOMElement();
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

  it('띠는 보조 영역으로 이름이 붙어 있다 — 본문과 구분되어야 건너뛸 수 있다', () => {
    useCompare.setState({ items: [coat(1)] });
    render(<CompareTray />);

    expect(screen.getByRole('complementary', { name: '비교함' })).toBeInTheDocument();
  });
});
