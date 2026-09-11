import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button, buttonVariants } from '../src/components/button';
import { expectNoA11yViolations } from './a11y';

describe('Button', () => {
  it('type을 지정하지 않으면 button이다 — 폼 안에서 의도치 않게 submit되면 안 된다', () => {
    render(<Button>담기</Button>);
    expect(screen.getByRole('button', { name: '담기' })).toHaveAttribute('type', 'button');
  });

  it('type=submit은 명시하면 존중한다', () => {
    render(<Button type="submit">결제하기</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('클릭 핸들러가 동작한다', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>담기</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('aria-disabled 버튼은 포커스를 받을 수 있다 — 왜 못 누르는지 알려주기 위해', async () => {
    render(<Button aria-disabled="true">사이즈를 선택하세요</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    btn.focus();
    expect(btn).toHaveFocus();
  });

  it('disabled 버튼은 클릭되지 않는다', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>담기</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'accent', 'ghost', 'danger'] as const)(
    '%s 변형이 접근성 위반 없이 렌더된다',
    async (variant) => {
      const { container } = render(<Button variant={variant}>주문하기</Button>);
      await expectNoA11yViolations(container);
    },
  );

  it('모바일 기본 크기(lg)는 터치 타겟 48px를 만족한다', () => {
    render(<Button>주문하기</Button>);
    // h-12 = 3rem = 48px. WCAG 2.2 목표 크기(24px)와 애플 HIG(44px)를 모두 넘는다.
    expect(screen.getByRole('button').className).toContain('h-12');
  });
});

/**
 * 못 누르는 버튼은 **못 누르게 생겨야 한다.**
 *
 * 이 컴포넌트는 `disabled` 보다 `aria-disabled` 를 권한다 — 못 누르는 버튼도
 * 포커스를 받아야 왜 못 누르는지 들리기 때문이다. 그런데 색을 바꾸는 규칙은
 * primary 에만 양쪽이 붙어 있었고 나머지 넷은 `disabled:` 뿐이었다.
 * **권하는 대로 쓴 사람이 벌을 받는 구조였다** — 버튼이 평소와 똑같이
 * 보이는데 눌러도 아무 일이 안 일어난다.
 *
 * 실제로 상품 상세의 `장바구니 담기`(secondary)가 그랬다. 옵션을 고르기
 * 전에도 멀쩡해 보였고, 마우스를 올리면 밝아지기까지 했다. 바로 옆
 * `구매하기`(primary)는 흐려지는데 둘이 나란히 서 있었다.
 *
 * 짝은 손으로 맞춘다 — 클래스 이름을 코드로 조립하면 Tailwind 가 그 문자열을
 * 못 보고 CSS 를 아예 안 만든다. 그러니 **맞춰졌는지는 검사가 지킨다.**
 */
describe('못 누르는 모양은 disabled 와 aria-disabled 가 같다', () => {
  const VARIANTS = ['primary', 'secondary', 'accent', 'ghost', 'danger'] as const;

  /** `bg-[var(--surface)]` → `bg`, `border-n-500` → `border` */
  const property = (cls: string): string => cls.split('-')[0] ?? cls;

  const classesOf = (variant: (typeof VARIANTS)[number]) =>
    buttonVariants({ variant }).split(/\s+/).filter(Boolean);

  const stripped = (classes: readonly string[], prefix: string) =>
    classes.filter((c) => c.startsWith(prefix)).map((c) => c.slice(prefix.length));

  it('검사가 실제로 클래스를 읽는다 — 못 읽으면 아래는 전부 통과한다', () => {
    // 빈 목록끼리는 언제나 같다. 눈을 감고 통과하는 자리를 먼저 막는다.
    for (const variant of VARIANTS) {
      expect(classesOf(variant).length, `${variant} 의 클래스를 못 읽었다`).toBeGreaterThan(3);
      expect(stripped(classesOf(variant), 'disabled:').length).toBeGreaterThan(0);
    }
  });

  it.each(VARIANTS)('%s 는 두 표기에 같은 모양을 준다', (variant) => {
    const classes = classesOf(variant);
    // `aria-disabled:hover:` 는 hover 를 눌러 두는 것이라 짝 비교에서 뺀다
    const aria = stripped(classes, 'aria-disabled:').filter((c) => !c.startsWith('hover:'));
    expect(
      new Set(aria),
      `${variant}: disabled 와 aria-disabled 가 다른 모양을 준다`,
    ).toEqual(new Set(stripped(classes, 'disabled:')));
  });

  it.each(VARIANTS)('%s 는 못 누를 때 hover 도 눌러 둔다', (variant) => {
    const classes = classesOf(variant);
    const hovered = new Set(stripped(classes, 'hover:').map(property));
    const offHovered = new Set(
      stripped(classes, 'aria-disabled:hover:').map(property),
    );
    for (const prop of hovered) {
      expect(
        offHovered.has(prop),
        `${variant}: 못 누르는데 마우스를 올리면 ${prop} 가 바뀐다 — 눌린다고 말하는 셈이다`,
      ).toBe(true);
    }
  });
});
