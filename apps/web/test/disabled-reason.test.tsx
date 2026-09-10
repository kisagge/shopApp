// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * **못 누르는 버튼은 왜 못 누르는지 말한다.**
 *
 * 이 저장소는 `disabled` 대신 `aria-disabled` 를 쓰기로 정했다 — 못 누르는
 * 버튼이 초점을 못 받으면 이유를 들을 자리조차 없기 때문이다. 그런데 초점만
 * 받게 해 놓고 이유를 아무 데도 안 적으면 반만 한 것이다. 실제로 그랬다:
 * 상품 화면의 구매하기는 못 누를 때 이름이 '옵션을 선택하세요' 로 바뀌는데,
 * 바로 옆 **장바구니 담기는 안 바뀌어서** 낭독기에 "장바구니 담기, 사용 불가"
 * 만 들렸다. 결제하기는 막는 조건이 다섯인데 하나도 말하지 않았다.
 *
 * 이름으로 말하든(조건이 하나일 때) 설명으로 말하든(여럿일 때) 상관없다.
 * **아무 말도 안 하는 것**만 막는다.
 */

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
    pick({ items: [{ variantId: 'v-1', quantity: 1, selected: true }], add: vi.fn() }),
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
const { ProductOptions } = await import('~/components/product-options');
const { CancelOrderButton } = await import('~/components/cancel-order-button');

const address = {
  id: 'a-1', label: '집', recipient: '장병윤', phone: '010-2345-6789',
  postalCode: '04766', address1: '서울 성동구 왕십리로 000', address2: '101동',
  isDefault: true, isRemoteArea: false,
} as never;

/** 버튼이 지금 알리는 말 — 이름과 설명을 합친 것 */
function announced(button: HTMLElement): string {
  const described = (button.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  return `${button.textContent ?? ''} ${described}`.trim();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

describe('못 누르는 버튼이 이유를 말한다', () => {
  it('결제하기 — 약관에 동의하기 전', () => {
    render(<CheckoutForm defaultAddress={address} paymentMode="mock" />);
    const submit = screen.getByRole('button', { name: /289,000|주문/ });

    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(announced(submit)).toContain('약관에 동의해 주세요');
  });

  it('결제하기 — 배송지가 없을 때는 약관이 아니라 배송지를 말한다', () => {
    render(<CheckoutForm defaultAddress={null} paymentMode="mock" />);
    const submit = screen.getByRole('button', { name: /289,000|주문/ });

    expect(announced(submit)).toContain('받으실 곳을 먼저 입력해 주세요');
    expect(announced(submit)).not.toContain('약관');
  });

  it('결제하기 — 다 갖추면 이유가 사라지고 눌린다', async () => {
    const user = userEvent.setup();
    render(<CheckoutForm defaultAddress={address} paymentMode="mock" />);
    await user.click(screen.getByRole('checkbox'));

    const submit = screen.getByRole('button', { name: /289,000|주문/ });
    expect(submit).toHaveAttribute('aria-disabled', 'false');
    expect(document.getElementById('order-blocked')).toBeNull();
  });

  it('장바구니 담기 — 옵션을 고르기 전', () => {
    render(<ProductOptions product={product} loggedIn={false} restockOn={[]} />);
    const add = screen.getByRole('button', { name: '장바구니 담기' });

    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(announced(add)).toContain('옵션을 선택하세요');
  });
});

/** 옵션 두 벌을 가진 최소한의 상품 */
const product = {
  id: 'p-1',
  name: '코튼 트윌 와이드 팬츠',
  brand: 'MOOR',
  listPrice: 89_000,
  optionGroups: [
    { id: 'g-1', name: '사이즈', values: [{ id: 'ov-1', value: '28' }, { id: 'ov-2', value: '30' }] },
  ],
  variants: [
    { id: 'v-1', label: '28', price: 71_200, stock: 5, optionValueIds: ['ov-1'] },
    { id: 'v-2', label: '30', price: 71_200, stock: 3, optionValueIds: ['ov-2'] },
  ],
} as never;

/**
 * 다른 동작이 진행 중이라 잠긴 **옆 버튼**도 이유를 말한다.
 *
 * 보내는 중인 버튼은 이름이 '취소하는 중' 으로 바뀌어 스스로 설명한다.
 * 그 옆의 '돌아가기' 는 이름이 그대로라, 낭독기에는 "돌아가기, 사용 불가"
 * 만 들리고 왜인지는 어디에도 없었다.
 */
describe('진행 중이라 잠긴 옆 버튼', () => {
  it('보내는 동안 돌아가기가 왜 잠겼는지 말한다', async () => {
    const user = userEvent.setup();
    // 응답을 붙잡아 둬서 '보내는 중' 상태를 만든다
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<CancelOrderButton orderNo="A-1" />);

    await user.click(screen.getByRole('button', { name: /주문 취소/ }));
    await user.click(screen.getByRole('button', { name: /주문 취소/ }));

    const back = screen.getByRole('button', { name: '돌아가기' });
    await waitFor(() => expect(back).toHaveAttribute('aria-disabled', 'true'));
    expect(announced(back)).toContain('처리가 끝난 뒤에 누를 수 있습니다');
  });

  it('가만히 있을 때는 이유를 붙이지 않는다 — 늘 붙어 있으면 뜻이 없다', async () => {
    const user = userEvent.setup();
    render(<CancelOrderButton orderNo="A-1" />);
    await user.click(screen.getByRole('button', { name: /주문 취소/ }));

    const back = screen.getByRole('button', { name: '돌아가기' });
    expect(back).toHaveAttribute('aria-disabled', 'false');
    expect(announced(back)).toBe('돌아가기');
  });
});
