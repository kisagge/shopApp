// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CartQuoteResponse } from '@shop/contract';

const useCartQuote = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/use-cart-quote', () => ({ useCartQuote }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { CartView } = await import('~/components/cart-view');
const { useCartStore } = await import('~/stores/cart');

const item = (over: Record<string, unknown> = {}) => ({
  variantId: 'v-coat-s', productId: 'p-coat', productName: '오버사이즈 울 블렌드 코트',
  brand: 'STUDIO NOON', optionLabel: '오트밀 / S',
  listPrice: 413_000, salePrice: 289_000, quantity: 9, selected: true,
  ...over,
});

const quote = (over: Partial<CartQuoteResponse> = {}): CartQuoteResponse => ({
  lines: [{
    variantId: 'v-coat-s', productSlug: 'oversized-wool-coat',
    productName: '오버사이즈 울 블렌드 코트', brandName: 'STUDIO NOON', optionLabel: '오트밀 / S',
    imageUrl: null, imageAlt: null, blurDataUrl: null,
    listPrice: 413_000, unitPrice: 289_000, discountPercent: 30,
    quantity: 4, requestedQuantity: 9, subtotal: 1_156_000, stock: 4, issue: 'STOCK_REDUCED',
  }],
  listTotal: 1_652_000, productDiscount: 496_000, merchandiseTotal: 1_156_000,
  couponDiscount: 0, couponName: null, pointsUsed: 0, pointsAvailable: 0,
  shippingFee: 0, isFreeShipping: true, remainingForFreeShipping: 0,
  payable: 1_156_000, rewardPoints: 11_560,
  ...over,
});

const ok = (data: CartQuoteResponse) => ({ data, isPending: false, isError: false });

beforeEach(() => {
  useCartStore.setState({ items: [] });
  localStorage.clear();
  useCartQuote.mockReset();
});

describe('빈 장바구니', () => {
  it('안내와 쇼핑 링크를 보여 준다', () => {
    useCartQuote.mockReturnValue({ data: undefined, isPending: false, isError: false });
    render(<CartView />);
    expect(screen.getByText('장바구니가 비어 있습니다.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '쇼핑하러 가기' })).toHaveAttribute('href', '/');
  });
});

describe('무한 렌더 회귀', () => {
  it('항목이 있어도 한 번만 렌더된다', () => {
    // 셀렉터가 렌더마다 새 배열을 돌려주면 스토어 스냅샷이 계속 바뀌어
    // "Maximum update depth exceeded" 로 죽는다. 실제로 겪었던 버그다.
    useCartQuote.mockReturnValue(ok(quote()));
    useCartStore.setState({ items: [item()] });

    expect(() => render(<CartView />)).not.toThrow();
    // 렌더 1회당 훅 호출 1회. 루프가 돌면 수십~수백 번이 된다.
    expect(useCartQuote.mock.calls.length).toBeLessThan(5);
  });
});

describe('담아 둔 사이에 생긴 문제를 사용자에게 알린다', () => {
  beforeEach(() => useCartStore.setState({ items: [item()] }));

  it('재고 부족이면 문장과 함께 몇 개로 줄었는지 보여 준다', () => {
    useCartQuote.mockReturnValue(ok(quote()));
    render(<CartView />);
    expect(screen.getByText('재고가 부족해 수량을 줄였습니다')).toBeInTheDocument();
    expect(screen.getByText('(9→4)')).toBeInTheDocument();
  });

  it('금액은 요청 수량이 아니라 서버가 계산한 값을 보여 준다', () => {
    useCartQuote.mockReturnValue(ok(quote()));
    render(<CartView />);
    // 289,000 × 9 = 2,601,000 이 아니라 × 4 = 1,156,000
    expect(screen.getAllByText(/1,156,000/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2,601,000/)).not.toBeInTheDocument();
  });

  it('품절이면 주문 버튼을 잠근다', () => {
    useCartQuote.mockReturnValue(
      ok(quote({
        lines: [{ ...quote().lines[0]!, quantity: 0, issue: 'SOLD_OUT' }],
        payable: 0,
      })),
    );
    render(<CartView />);
    const cta = screen.getByRole('button', { name: '주문할 수 있는 상품이 없습니다' });
    expect(cta).toHaveAttribute('aria-disabled', 'true');
  });

  it('살 수 있는 상품이 있으면 개수와 함께 주문 버튼을 연다', () => {
    useCartQuote.mockReturnValue(ok(quote()));
    render(<CartView />);
    expect(screen.getByRole('button', { name: '주문하기 (1)' })).toHaveAttribute('aria-disabled', 'false');
  });
});

describe('선택', () => {
  it('아무것도 선택하지 않으면 금액 대신 안내를 보여 준다', () => {
    useCartQuote.mockReturnValue({ data: undefined, isPending: false, isError: false });
    useCartStore.setState({ items: [item({ selected: false })] });
    render(<CartView />);
    expect(screen.getByText('주문할 상품을 선택해 주세요.')).toBeInTheDocument();
  });

  it('전체선택 상태를 개수로 보여 준다', () => {
    useCartQuote.mockReturnValue(ok(quote()));
    useCartStore.setState({ items: [item(), item({ variantId: 'v-2', selected: false })] });
    render(<CartView />);
    expect(screen.getByText('(1/2)')).toBeInTheDocument();
  });
});

describe('견적 실패', () => {
  it('금액을 못 불러오면 알린다 — 조용히 0원을 보여 주면 안 된다', () => {
    useCartQuote.mockReturnValue({ data: undefined, isPending: false, isError: true });
    useCartStore.setState({ items: [item()] });
    render(<CartView />);
    expect(screen.getByRole('alert')).toHaveTextContent('금액을 불러오지 못했습니다');
  });
});

/**
 * 담은 것이 무엇인지 눈으로 확인할 수 있어야 한다.
 *
 * 예전에는 "IMG" 라고 적힌 회색 칸이었다. 옵션이 비슷한 상품을 여럿 담으면
 * 무엇이 무엇인지 구별할 방법이 없었다.
 */
describe('장바구니 사진', () => {
  it('견적이 준 사진을 그린다', () => {
    useCartQuote.mockReturnValue(
      ok(quote({
        lines: [{ ...quote().lines[0]!, imageUrl: 'https://cdn.test/coat.jpg', imageAlt: '오트밀 코트' }],
      })),
    );
    useCartStore.setState({ items: [item()] });
    render(<CartView />);

    expect(screen.getByRole('img', { name: '오트밀 코트' })).toBeInTheDocument();
  });

  it('사진이 없으면 자리표시가 남는다 — 자리가 비지 않는다', () => {
    useCartQuote.mockReturnValue(ok(quote()));
    useCartStore.setState({ items: [item()] });
    render(<CartView />);

    // 사진이 없다고 이름까지 없어지지 않는다
    expect(screen.getByRole('img', { name: /오버사이즈 울 블렌드 코트/ })).toBeInTheDocument();
  });
});

/**
 * 초점.
 *
 * ✕ 를 누르면 **그 버튼이 속한 줄이 통째로 사라진다.** 챙기지 않으면 초점이
 * `<body>` 로 떨어지고, 키보드로 세 줄을 지우려면 탭으로 문서 맨 앞부터 세 번
 * 내려와야 한다.
 *
 * **자동 접근성 훑기로는 안 잡힌다.** 정지한 화면의 마크업은 지우기 전이나
 * 후나 멀쩡하다 — 사라진 뒤 초점이 어디 있는지는 axe 가 보지 않는다.
 */
describe('장바구니 — 줄을 지운 뒤 초점', () => {
  beforeEach(() => {
    // 이 묶음은 초점만 본다. 금액은 관계없으므로 견적을 비워 둔다.
    useCartQuote.mockReturnValue({ data: undefined, isPending: false, isError: false });
  });

  const three = [
    item({ variantId: 'v-1', productName: '코트' }),
    item({ variantId: 'v-2', productName: '니트' }),
    item({ variantId: 'v-3', productName: '팬츠' }),
  ];

  const removeButtons = () =>
    [...document.querySelectorAll<HTMLElement>('[data-remove-row]')];

  it('가운데 줄을 지우면 그 자리에 온 줄로 간다', async () => {
    useCartStore.setState({ items: three });
    render(<CartView />);

    await userEvent.click(removeButtons()[1]!);

    // 지운 자리를 이어받은 줄. 위에서 아래로 지워 나가는 동작이 끊기지 않는다.
    expect(document.activeElement).toBe(removeButtons()[1]);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('마지막 줄을 지우면 그 앞줄로 간다', async () => {
    useCartStore.setState({ items: three });
    render(<CartView />);

    await userEvent.click(removeButtons()[2]!);

    const left = removeButtons();
    expect(left).toHaveLength(2);
    expect(document.activeElement).toBe(left[1]);
  });

  it('다 지우면 비었다는 말로 간다', async () => {
    /*
     * 마지막 줄을 지우면 목록이 통째로 다른 화면으로 바뀐다. 초점이 갈 곳이
     * 없으면 낭독기는 장바구니가 비었다는 말을 하지 않는다.
     */
    useCartStore.setState({ items: [item({ variantId: 'v-1' })] });
    render(<CartView />);

    await userEvent.click(removeButtons()[0]!);

    expect(document.activeElement).toBe(screen.getByRole('status'));
    expect(document.activeElement).toHaveTextContent('장바구니가 비어 있습니다');
  });

  it('처음 그릴 때는 초점을 끌어오지 않는다', () => {
    useCartStore.setState({ items: three });
    render(<CartView />);
    expect(document.activeElement).toBe(document.body);
  });
});
