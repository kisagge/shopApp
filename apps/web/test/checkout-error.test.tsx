// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  // AppLink 가 이 훅을 쓴다 — 흉내 낼 때 빠뜨리면 링크를 그리는 순간 터진다
  useLinkStatus: () => ({ pending: false }),
}));

const CheckoutError = (await import('~/app/(shop)/checkout/error')).default;

/**
 * 결제 도중 화면이 깨졌을 때.
 *
 * **여기서는 "다시 시도" 가 틀린 안내다.** 주문 만들기와 결제 승인은 서로
 * 다른 요청이고, 그 사이 어디에서 깨졌는지 화면은 알 수 없다. 이미 만들어진
 * 주문을 다시 넣으면 같은 물건을 두 번 사게 된다.
 */
describe('결제 오류 화면', () => {
  const error = Object.assign(new Error('터졌다'), { digest: 'abc123' });

  it('주문이 이미 있을 수 있다고 알린다', () => {
    render(<CheckoutError error={error} />);
    expect(screen.getByRole('heading')).toHaveTextContent('주문 도중 문제가 생겼습니다');
    expect(screen.getByText(/주문이 이미 만들어졌을 수 있습니다/)).toBeInTheDocument();
  });

  it('확인할 곳으로 데려간다', () => {
    render(<CheckoutError error={error} />);
    expect(screen.getByRole('link', { name: '주문 내역 확인' })).toHaveAttribute(
      'href',
      '/mypage/orders',
    );
  });

  it('다시 시도 버튼을 두지 않는다', () => {
    // 누르면 방금 만들어진 주문을 다시 넣게 된다
    render(<CheckoutError error={error} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('오류 번호를 보여 준다 — 문의가 오면 이 값으로 찾는다', () => {
    render(<CheckoutError error={error} />);
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('오류 번호가 없으면 그 자리를 비운다', () => {
    render(<CheckoutError error={new Error('digest 없음')} />);
    expect(screen.queryByText(/오류 번호/)).toBeNull();
  });
});
