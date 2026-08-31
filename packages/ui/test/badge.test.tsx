import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../src/components/badge';
import { expectNoA11yViolations } from './a11y';

describe('Badge', () => {
  it.each([
    ['sale', 'SALE 30%'],
    ['new', 'NEW'],
    ['info', '무료배송'],
    ['success', '배송완료'],
    ['neutral', '입금대기'],
    ['danger', '품절'],
    ['outline', '교환·반품 접수'],
  ] as const)('%s 톤이 텍스트와 함께 렌더된다', async (tone, label) => {
    const { container } = render(<Badge tone={tone}>{label}</Badge>);
    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
