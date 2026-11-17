// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MIN_POINTS_USE } from '@shop/core';

const quoteData = {
  lines: [{
    variantId: 'v-1', productName: '코트', brandName: 'STUDIO NOON',
    optionLabel: '오트밀 / M', quantity: 1,
    listPrice: 413_000, unitPrice: 289_000, subtotal: 289_000, issue: null,
  }],
  listTotal: 413_000, productDiscount: 124_000, couponDiscount: 0,
  coupons: [], couponCode: null, couponName: null,
  pointsUsed: 0, shippingFee: 0, payable: 289_000, rewardPoints: 2_890,
  pointBalance: 12_000, pointsAvailable: 12_000, maxPointsUsable: 12_000,
};

const refetch = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('~/lib/use-cart-quote', () => ({
  useCartQuote: () => ({ data: quoteData, refetch, isPending: false, isError: false }),
}));
vi.mock('~/stores/cart', () => ({
  useCartStore: (pick: (s: unknown) => unknown) =>
    pick({ items: [{ variantId: 'v-1', quantity: 1, selected: true }] }),
}));

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));
vi.mock('~/lib/analytics/session', () => ({
  getSessionId: () => 'session-0001',
  getAnonymousId: () => 'anon-0001',
}));
vi.mock('~/lib/payments/client', () => ({
  openPaymentWindow: vi.fn(),
  isUsableClientKey: () => false,
}));

/** 주문 보내기를 손에 쥔다 — 무엇이 실려 가는지와, 막혔을 때 무엇을 하는지를 본다 */
const place = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/checkout/place-order', () => ({
  usePlaceOrder: () => ({ place, pending: false, error: null }),
}));

/**
 * 배송지 고르는 자리는 따로 산다(`address-picker` 가 자기 검사를 가졌다).
 * 여기서는 **이 화면이 그 자리에 무엇을 걸었는지**만 본다.
 */
const PICKED = {
  id: 'a-2', label: '회사', recipient: '장병윤', phone: '010-0000-0000',
  postalCode: '63000', address1: '제주 어딘가', address2: null,
  isDefault: false, isRemoteArea: true,
};
vi.mock('~/components/address-picker', () => ({
  AddressPicker: ({ onPicked, onCancel }: {
    onPicked: (a: typeof PICKED) => void;
    onCancel: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onPicked(PICKED)}>먼 곳 배송지 고르기</button>
      <button type="button" onClick={onCancel}>고르기 그만</button>
    </div>
  ),
}));

const { CheckoutForm } = await import('~/components/checkout-form');

/**
 * 주문서의 칸들.
 *
 * **핸들러마다 돈이 걸려 있는데 하나도 안 돌고 있었다.** 메모는 기사에게 가고,
 * 포인트는 낼 돈을 깎고, 배송지는 먼 곳 추가 요금을 가른다. 셈은 서버가 하지만
 * **무엇을 셈하라고 보낼지**는 이 칸들이 정한다.
 */

const address = {
  id: 'a-1', label: '집', recipient: '장병윤', phone: '010-2345-6789',
  postalCode: '04766', address1: '서울 성동구 왕십리로 000', address2: '101동',
  isDefault: true, isRemoteArea: false,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  place.mockResolvedValue({ refetchQuote: false });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});

const ready = async () => {
  const user = userEvent.setup();
  render(<CheckoutForm remoteSurcharge={3000} defaultAddress={address} paymentMode="mock" />);
  // 약관 동의 — 누르지 않으면 주문 단추가 지킨다
  await user.click(screen.getByRole('checkbox'));
  return user;
};

const order = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: /주문|289,000|결제/ }));
  await waitFor(() => expect(place).toHaveBeenCalled());
  return place.mock.calls[0]![0] as Record<string, unknown>;
};

describe('배송지 고치기', () => {
  it('누르면 고르는 자리가 열리고, 그만두면 닫힌다', async () => {
    const user = await ready();

    await user.click(screen.getByRole('button', { name: '변경' }));
    expect(screen.getByRole('button', { name: '고르기 그만' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '고르기 그만' }));
    expect(screen.queryByRole('button', { name: '고르기 그만' })).toBeNull();
  });

  it('고른 배송지로 바뀌고 그 자리가 닫힌다', async () => {
    const user = await ready();

    await user.click(screen.getByRole('button', { name: '변경' }));
    await user.click(screen.getByRole('button', { name: '먼 곳 배송지 고르기' }));

    expect(screen.queryByRole('button', { name: '먼 곳 배송지 고르기' })).toBeNull();
    expect(screen.getByText(/제주 어딘가/)).toBeInTheDocument();
    expect((await order(user)).addressId).toBe('a-2');
  });

  it('먼 곳인지까지 적어 둔다 — 가는 길에서 어디가 걸리는지 보는 값이다', async () => {
    const user = await ready();

    await user.click(screen.getByRole('button', { name: '변경' }));
    await user.click(screen.getByRole('button', { name: '먼 곳 배송지 고르기' }));

    expect(track).toHaveBeenCalledWith('add_shipping_info', { remote: true });
  });
});

describe('기사에게 가는 말', () => {
  it('적은 메모가 주문에 실린다', async () => {
    const user = await ready();

    await user.type(screen.getByLabelText('배송 요청사항'), '문 앞에 둬 주세요');

    expect((await order(user)).memo).toBe('문 앞에 둬 주세요');
  });

  it('안 적으면 빈 글자로 간다 — 없는 것과 빈 것을 서버가 가른다', async () => {
    const user = await ready();

    expect((await order(user)).memo).toBe('');
  });
});

describe('포인트', () => {
  const field = () => screen.getByLabelText('사용할 포인트');

  it('적은 수만큼 쓴다', async () => {
    const user = await ready();

    await user.type(field(), '5000');

    expect((await order(user)).pointsToUse).toBe(5_000);
  });

  it('음수는 0 으로 떨어진다 — 포인트로 돈을 받을 수는 없다', async () => {
    const user = await ready();

    await user.type(field(), '-500');

    expect((await order(user)).pointsToUse).toBe(0);
  });

  it('수가 아닌 글자는 0 으로 본다 — NaN 이 창구까지 가면 안 된다', async () => {
    const user = await ready();

    await user.type(field(), '1000');
    await user.clear(field());

    expect((await order(user)).pointsToUse).toBe(0);
  });

  it('전부 쓰기를 누르면 쓸 수 있는 만큼 채운다', async () => {
    const user = await ready();

    await user.click(screen.getByRole('button', { name: '전액사용' }));

    expect(field()).toHaveValue(quoteData.pointsAvailable);
    expect((await order(user)).pointsToUse).toBe(quoteData.pointsAvailable);
  });

  it('하한은 core 가 쥔다 — 화면이 따로 적지 않는다', () => {
    expect(MIN_POINTS_USE).toBeGreaterThan(0);
  });
});

describe('재고 때문에 막혔을 때', () => {
  it('금액을 다시 받는다 — 줄어든 수로 다시 셈해야 한다', async () => {
    /*
     * 주문이 재고로 막히면 그 자리에서 수가 줄어든 것이다. 금액을 그대로 두면
     * **화면의 금액과 실제로 낼 돈이 다르고**, 사람은 옛 금액을 보고 다시 누른다.
     */
    place.mockResolvedValue({ refetchQuote: true });
    const user = await ready();

    await order(user);

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
  });

  it('그 밖의 실패에는 다시 받지 않는다 — 쓸데없는 왕복을 늘리지 않는다', async () => {
    place.mockResolvedValue({ refetchQuote: false });
    const user = await ready();

    await order(user);

    expect(refetch).not.toHaveBeenCalled();
  });
});
