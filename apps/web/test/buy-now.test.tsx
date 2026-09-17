// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCartStore } from '~/stores/cart';
import { useBuyNowStore } from '~/stores/buy-now';

/**
 * 바로 구매.
 *
 * 상품 화면의 주 단추인데 한동안 눌러도 아무 일도 없었다. 붙이면서 **장바구니를 건드리지 않기로** 했다 —
 * 담아 둔 다른 줄의 선택을 바꾸지도, 주문 뒤에 담아 둔 같은 옵션을 지우지도 않는다.
 */

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { ProductOptions } = await import('~/components/product-options');

const assign = vi.fn<(...a: any[]) => any>();

const product = {
  id: 'p-1', slug: 'coat', name: '울 코트', brand: '무어', description: '',
  listPrice: 413_000, price: 289_000, soldOut: false,
  images: [{ url: '/coat.jpg', alt: '', blurDataUrl: null, credit: null, creditUrl: null }],
  optionGroups: [{ id: 'g-size', name: '사이즈', values: [{ id: 'o-m', value: 'M', swatchHex: null }] }],
  variants: [{ id: 'v-m', sku: 'C-M', label: 'M', stock: 4, optionValueIds: ['o-m'], price: 289_000 }],
} as unknown as Parameters<typeof ProductOptions>[0]['product'];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('location', { assign });
  localStorage.clear();
  sessionStorage.clear();
  useCartStore.setState({ items: [] });
  useBuyNowStore.setState({ item: null });
});

describe('상품 화면의 바로 구매', () => {
  it('옵션을 고르기 전에는 누를 수 없다고 말하고 아무 데도 가지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    const buy = screen.getByRole('button', { name: '옵션을 선택하세요' });
    expect(buy.getAttribute('aria-disabled')).toBe('true');
    await user.click(buy);

    expect(assign).not.toHaveBeenCalled();
    expect(useBuyNowStore.getState().item).toBeNull();
  });

  it('고르고 누르면 그 옵션과 수량을 들고 결제 화면으로 간다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.click(screen.getByRole('radio', { name: 'M' }));
    await user.click(screen.getByRole('button', { name: '바로 구매' }));

    expect(useBuyNowStore.getState().item).toMatchObject({
      variantId: 'v-m', productId: 'p-1', productName: '울 코트', optionLabel: 'M',
      salePrice: 289_000, quantity: 1, selected: true, imageUrl: '/coat.jpg',
    });
    expect(assign).toHaveBeenCalledWith('/checkout?now=1');
    expect(track).toHaveBeenCalledWith('begin_checkout', { itemCount: 1 });
  });

  it('장바구니는 건드리지 않는다 — 담아 둔 것의 수량도 선택도 그대로다', async () => {
    const user = userEvent.setup();
    useCartStore.setState({
      items: [
        { variantId: 'v-m', productId: 'p-1', productName: '울 코트', brand: '무어', optionLabel: 'M', listPrice: 413_000, salePrice: 289_000, quantity: 2, selected: false },
        { variantId: 'v-x', productId: 'p-2', productName: '니트', brand: '무어', optionLabel: 'L', listPrice: 99_000, salePrice: 99_000, quantity: 1, selected: true },
      ],
    });
    const before = structuredClone(useCartStore.getState().items);
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.click(screen.getByRole('radio', { name: 'M' }));
    await user.click(screen.getByRole('button', { name: '바로 구매' }));

    expect(useCartStore.getState().items).toEqual(before);
  });

  it('담은 것은 이 탭에만 남는다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.click(screen.getByRole('radio', { name: 'M' }));
    await user.click(screen.getByRole('button', { name: '바로 구매' }));

    await waitFor(() => expect(sessionStorage.getItem('shop.buy-now')).toContain('v-m'));
    expect(localStorage.getItem('shop.buy-now')).toBeNull();
  });
});
