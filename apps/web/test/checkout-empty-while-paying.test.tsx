// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * **결제가 도는 동안 결제 화면이 "주문할 상품이 없습니다" 로 바뀌면 안 된다.**
 *
 * 주문에 들어간 것을 장바구니에서 빼야 하는데, 그 순간 이 화면은 고를 것이
 * 없다고 판단해 빈 상태를 세운다. 주소가 주문 화면으로 바뀌기까지는 0.6~1초가
 * 더 걸리므로, 결제를 누른 사람은 그 사이 **장바구니가 비었다는 말**을 본다 —
 * 기기에서 실제로 그렇게 보였다.
 *
 * 가르는 것은 "지금 주문이 도는 중인가" 하나다. 빈 장바구니로 이 화면에
 * 들어온 사람에게는 그대로 이 문구가 필요하다.
 */

let cartItems: { variantId: string; quantity: number; selected: boolean }[] = [];
const place = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
let pending = false;

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('~/lib/use-cart-quote', () => ({
  useCartQuote: () => ({
    data: {
      lines: [], listTotal: 0, productDiscount: 0, couponDiscount: 0, pointsUsed: 0,
      shippingFee: 0, payable: 0, rewardPoints: 0, pointBalance: 0, maxPointsUsable: 0,
    },
  }),
}));
vi.mock('~/stores/cart', () => ({
  useCartStore: (pick: (s: unknown) => unknown) => pick({ items: cartItems }),
}));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));
vi.mock('~/lib/analytics/session', () => ({
  getSessionId: () => 'session-0001',
  getAnonymousId: () => 'anon-0001',
}));
vi.mock('~/lib/payments/client', () => ({ openPaymentWindow: vi.fn() }));
vi.mock('~/components/address-picker', () => ({ AddressPicker: () => null }));
vi.mock('~/lib/checkout/place-order', () => ({
  usePlaceOrder: () => ({ place, pending, error: null }),
}));

const { CheckoutForm } = await import('~/components/checkout-form');

const draw = () => render(<CheckoutForm defaultAddress={null} paymentMode="mock" />);

beforeEach(() => {
  vi.clearAllMocks();
  cartItems = [];
  pending = false;
});

describe('빈 장바구니 문구를 언제 세우는가', () => {
  it('그냥 빈 채로 들어오면 안내한다', () => {
    draw();
    expect(screen.getByText(/주문할 상품이 없습니다/)).toBeInTheDocument();
  });

  it('주문이 도는 중이면 안내하지 않는다 — 방금 결제를 누른 사람이다', () => {
    pending = true;
    draw();
    expect(screen.queryByText(/주문할 상품이 없습니다/)).toBeNull();
  });

  /**
   * 버튼 아래 사유 문구도 같은 말을 한다. 큰 블록만 감추고 이것을 남기면
   * 결제를 누른 사람에게 여전히 "주문할 상품이 없습니다" 가 보인다 —
   * 같은 결함의 축소판이다.
   */
  it('버튼 아래 사유도 도는 중에는 말하지 않는다', () => {
    pending = true;
    draw();
    expect(document.getElementById('order-blocked')).toBeNull();
  });
});
