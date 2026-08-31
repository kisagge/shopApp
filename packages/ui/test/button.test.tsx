import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from '../src/components/button';
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
