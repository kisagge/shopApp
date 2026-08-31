import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Field } from '../src/components/field';
import { expectNoA11yViolations } from './a11y';

describe('Field', () => {
  it('라벨과 입력이 id로 연결된다', () => {
    render(<Field label="받는 분" />);
    // getByLabelText가 찾는다는 것 자체가 연결됐다는 뜻이다
    expect(screen.getByLabelText('받는 분')).toBeInstanceOf(HTMLInputElement);
  });

  it('타이핑한 값이 반영된다', async () => {
    render(<Field label="받는 분" />);
    const input = screen.getByLabelText('받는 분');
    await userEvent.type(input, '장병윤');
    expect(input).toHaveValue('장병윤');
  });

  it('에러가 있으면 aria-invalid와 aria-describedby로 연결한다', () => {
    render(<Field label="연락처" error="휴대폰 번호 11자리를 입력해 주세요" />);
    const input = screen.getByLabelText('연락처');
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('휴대폰 번호 11자리를 입력해 주세요');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('에러가 없으면 aria-invalid를 붙이지 않는다', () => {
    render(<Field label="연락처" />);
    expect(screen.getByLabelText('연락처')).not.toHaveAttribute('aria-invalid');
  });

  it('필수 표시는 별표만이 아니라 텍스트로도 전달한다', () => {
    render(<Field label="받는 분" required />);
    expect(screen.getByText('(필수)')).toBeInTheDocument();
  });

  it('에러가 뜨면 힌트는 숨긴다 — 두 문구가 겹쳐 읽히지 않도록', () => {
    render(<Field label="연락처" hint="- 없이 입력하세요" error="형식이 올바르지 않습니다" />);
    expect(screen.queryByText('- 없이 입력하세요')).not.toBeInTheDocument();
  });

  it('접근성 위반이 없다 (에러 상태 포함)', async () => {
    const { container } = render(<Field label="연락처" required error="형식이 올바르지 않습니다" />);
    await expectNoA11yViolations(container);
  });
});
