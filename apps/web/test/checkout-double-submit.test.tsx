// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const quote = {
  lines: [
    {
      variantId: 'v-1', productName: '코트', brandName: 'STUDIO NOON',
      optionLabel: '오트밀 / M', quantity: 1,
      listPrice: 413_000, unitPrice: 289_000, subtotal: 289_000, issue: null,
    },
  ],
  listTotal: 413_000, productDiscount: 124_000, couponDiscount: 0,
  pointsUsed: 0, shippingFee: 0, payable: 289_000, rewardPoints: 2_890,
  pointBalance: 0, maxPointsUsable: 0,
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('~/lib/use-cart-quote', () => ({ useCartQuote: () => ({ data: quote }) }));
vi.mock('~/stores/cart', () => ({
  useCartStore: (pick: (s: unknown) => unknown) =>
    pick({ items: [{ variantId: 'v-1', quantity: 1, selected: true }] }),
}));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));
vi.mock('~/lib/analytics/session', () => ({
  getSessionId: () => 'session-0001',
  getAnonymousId: () => 'anon-0001',
}));
vi.mock('~/lib/payments/client', () => ({
  openPaymentWindow: vi.fn(),
  isUsableClientKey: () => false,
}));
vi.mock('~/components/address-picker', () => ({ AddressPicker: () => null }));

const { CheckoutForm } = await import('~/components/checkout-form');

const address = {
  id: 'a-1', label: '집', recipient: '장병윤', phone: '010-2345-6789',
  postalCode: '04766', address1: '서울 성동구 왕십리로 000', address2: '101동',
  isDefault: true, isRemoteArea: false,
} as never;

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  // 응답을 붙잡아 둔다 — 첫 요청이 아직 안 끝난 사이에 두 번째를 누른다
  fetchMock.mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
});

const orderCalls = () =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/orders'));

async function ready() {
  const user = userEvent.setup();
  render(<CheckoutForm defaultAddress={address} paymentMode="mock" />);
  await user.click(screen.getByRole('checkbox'));
  return user;
}

describe('결제 버튼을 두 번 눌러도', () => {
  it('주문은 하나만 만든다', async () => {
    /*
     * Button 은 disabled 대신 aria-disabled 를 쓴다 — 못 누르는 버튼은
     * 초점을 못 받아 왜 못 누르는지 들리지 않기 때문이고, 그 판단은 옳다.
     * 대신 **눌리기는 하므로** 핸들러가 막아야 한다.
     */
    const user = await ready();
    const submit = screen.getByRole('button', { name: /289,000|주문/ });

    await user.click(submit);
    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    await user.click(submit);
    await user.click(submit);

    expect(orderCalls()).toHaveLength(1);
  });

  it('같은 시도임을 서버가 알아볼 열쇠를 함께 보낸다', async () => {
    const user = await ready();
    await user.click(screen.getByRole('button', { name: /289,000|주문/ }));

    await waitFor(() => expect(orderCalls()).toHaveLength(1));
    const body = JSON.parse(orderCalls()[0]![1].body);
    expect(body.idempotencyKey).toMatch(/^[A-Za-z0-9-]{16,64}$/);
  });

  it('약관에 동의하기 전에는 눌러도 보내지 않는다', async () => {
    const user = userEvent.setup();
    render(<CheckoutForm defaultAddress={address} paymentMode="mock" />);

    await user.click(screen.getByRole('button', { name: /289,000|주문/ }));

    expect(orderCalls()).toHaveLength(0);
  });
});
