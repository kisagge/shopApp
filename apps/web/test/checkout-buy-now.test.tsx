// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartItem } from '~/stores/cart';

/**
 * 결제 화면이 **무엇을 사는가** — 바로 구매면 그 하나, 아니면 장바구니에서 고른 줄.
 */

const line = (variantId: string, productName: string, selected = true): CartItem => ({
  variantId, productId: `p-${variantId}`, productName, brand: '무어', optionLabel: 'M',
  listPrice: 100_000, salePrice: 90_000, quantity: 1, selected,
});

let cartItems: CartItem[] = [];
const useCartQuote = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('~/lib/use-cart-quote', () => ({ useCartQuote }));
vi.mock('~/stores/cart', () => ({
  useCartStore: (pick: (s: unknown) => unknown) => pick({ items: cartItems }),
}));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));
vi.mock('~/lib/payments/client', () => ({ openPaymentWindow: vi.fn() }));
vi.mock('~/components/address-picker', () => ({ AddressPicker: () => null }));
const place = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/checkout/place-order', () => ({
  usePlaceOrder: () => ({ place, pending: false, error: null }),
}));

const { CheckoutForm } = await import('~/components/checkout-form');
const { useBuyNowStore } = await import('~/stores/buy-now');

const draw = (buyNow: boolean) =>
  render(<CheckoutForm buyNow={buyNow} remoteSurcharge={3000} defaultAddress={null} paymentMode="mock" />);

/** 견적에 넘긴 줄들의 옵션 id */
const quotedIds = () => (useCartQuote.mock.calls.at(-1)![0].items as CartItem[]).map((i) => i.variantId);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  useCartQuote.mockReturnValue({ data: undefined, isPending: true, refetch: vi.fn() });
  cartItems = [line('v-cart', '니트'), line('v-unpicked', '셔츠', false)];
  useBuyNowStore.setState({ item: null });
});

describe('바로 구매로 왔을 때', () => {
  it('장바구니가 아니라 바로 구매한 하나만 산다', () => {
    useBuyNowStore.setState({ item: line('v-now', '울 코트') });
    draw(true);

    expect(quotedIds()).toEqual(['v-now']);
    expect(screen.getByText(/울 코트/)).toBeInTheDocument();
    expect(screen.queryByText(/니트/)).toBeNull();
  });

  it('장바구니는 그대로 남는다고 말한다 — 담아 둔 것이 사라질까 걱정하지 않게', () => {
    useBuyNowStore.setState({ item: line('v-now', '울 코트') });
    draw(true);

    expect(screen.getByText('바로 구매하는 상품입니다. 장바구니에 담아 둔 것은 그대로 남습니다.')).toBeInTheDocument();
  });

  it('바로 구매할 것이 없으면(다른 탭에서 열었거나 이미 샀다) 장바구니를 대신 사지 않는다', () => {
    draw(true);

    expect(quotedIds()).toEqual([]);
    expect(screen.getByText(/주문할 상품이 없습니다/)).toBeInTheDocument();
  });
});

describe('장바구니에서 왔을 때', () => {
  it('고른 줄을 산다 — 바로 구매 칸에 남은 것이 있어도 섞지 않는다', () => {
    useBuyNowStore.setState({ item: line('v-now', '울 코트') });
    draw(false);

    expect(quotedIds()).toEqual(['v-cart']);
    expect(screen.queryByText(/바로 구매하는 상품입니다/)).toBeNull();
  });
});
