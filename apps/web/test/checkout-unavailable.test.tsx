// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ko } from '@shop/i18n/messages/ko';
import { LocaleProvider } from '~/lib/i18n/client';
import { CheckoutUnavailable } from '~/components/checkout/unavailable';

/**
 * 결제를 치를 수 없을 때 결제 화면이 보여 주는 것.
 *
 * 이 화면이 생긴 이유는 **주문만 만들어지고 확정이 500 이 나던 일** 때문이다.
 * 브라우저와 서버가 결제 방식을 각자 정하다 갈렸고, 배포에서 주문
 * 20260910-7063897 이 입금대기로 남았다. 이제는 폼을 아예 세우지 않는다.
 */
describe('결제할 수 없을 때의 안내', () => {
  const draw = () =>
    render(
      <LocaleProvider locale="ko" dict={ko}>
        <CheckoutUnavailable />
      </LocaleProvider>,
    );

  it('스스로 알린다 — 화면을 보고 있지 않아도 읽어 준다', () => {
    draw();
    // 폼이 있던 자리가 통째로 바뀌는 변화라 보조 기술에 알려야 한다
    expect(screen.getByRole('status')).toHaveTextContent('지금은 주문할 수 없습니다.');
  });

  it('무엇을 하면 되는지 말한다', () => {
    draw();
    expect(screen.getByText(/잠시 뒤에 다시 시도해 주세요/)).toBeInTheDocument();
  });

  it('설정 이야기를 하지 않는다 — 여기 온 사람이 할 수 있는 일이 아니다', () => {
    const { container } = draw();
    const text = container.textContent ?? '';
    for (const leak of ['TOSS', 'SECRET', 'KEY', 'mock', 'Mock', 'PAYMENT_GATEWAY']) {
      expect(text, leak).not.toContain(leak);
    }
  });

  it('주문할 수 있는 것처럼 보이는 버튼을 두지 않는다', () => {
    draw();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
