import { render, screen } from '@testing-library/react';
import { won } from '@shop/core';
import { describe, it, expect } from 'vitest';
import { Price } from '../src/components/price';
import { expectNoA11yViolations } from './a11y';

describe('Price', () => {
  it('천단위 구분자와 원 단위를 붙여 표시한다', () => {
    render(<Price amount={won(289_000)} />);
    expect(screen.getByText(/289,000/)).toBeInTheDocument();
    expect(screen.getByText('원')).toBeInTheDocument();
  });

  it('할인이 있으면 정가에 취소선을 긋고 할인율을 함께 보여준다', () => {
    render(<Price amount={won(289_000)} listPrice={won(413_000)} discountPercent={30} />);
    expect(screen.getByText(/413,000원/)).toBeInTheDocument();
    expect(screen.getByText(/30%/)).toBeInTheDocument();
  });

  it('취소선 금액이 무슨 값인지 스크린리더에 알린다', () => {
    render(<Price amount={won(289_000)} listPrice={won(413_000)} discountPercent={30} />);
    // "정가"라는 숨은 라벨이 없으면 두 숫자가 무엇인지 구분되지 않는다
    expect(screen.getByText('정가')).toBeInTheDocument();
    expect(screen.getByText('할인')).toBeInTheDocument();
  });

  it('할인율이 0이면 정가를 보여주지 않는다', () => {
    render(<Price amount={won(129_000)} listPrice={won(129_000)} discountPercent={0} />);
    expect(screen.queryByText('정가')).not.toBeInTheDocument();
  });

  it('접근성 위반이 없다', async () => {
    const { container } = render(
      <Price amount={won(289_000)} listPrice={won(413_000)} discountPercent={30} />,
    );
    await expectNoA11yViolations(container);
  });
});

describe('언어별 금액', () => {
  it('한국어는 단위를 뒤에, 다른 말은 기호를 앞에 붙인다', () => {
    const { unmount } = render(<Price amount={won(413_000)} />);
    expect(screen.getByText(/413,000/)).toBeInTheDocument();
    expect(screen.getByText('원')).toBeInTheDocument();
    unmount();

    render(<Price amount={won(413_000)} locale="ja" />);
    expect(screen.getByText('₩')).toBeInTheDocument();
    // 환율은 다루지 않는다 — 숫자는 그대로 원화다
    expect(screen.getByText('413,000')).toBeInTheDocument();
  });

  it('숨은 라벨도 그 말로 읽힌다', () => {
    render(<Price amount={won(289_000)} listPrice={won(413_000)} discountPercent={30} locale="en" />);
    expect(screen.getByText('List price')).toBeInTheDocument();
    expect(screen.getByText('off')).toBeInTheDocument();
  });
});
