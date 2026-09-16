// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCartStore } from '~/stores/cart';

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));

const { ReorderButton } = await import('~/components/reorder-button');

/**
 * 지난 주문 다시 담기 단추.
 *
 * **담은 뒤에 결과를 말한다.** 조용히 장바구니로 보내면 열 개 중 두 개가 빠진 것을
 * 결제 화면에서야 안다.
 */

const line = (variantId: string, over: Record<string, unknown> = {}) => ({
  variantId, productId: 'p-1', productName: '울 코트', brand: '무어',
  optionLabel: '오트 / M', listPrice: 413_000, salePrice: 289_000,
  imageUrl: null, blurDataUrl: null, quantity: 1, reduced: false, ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  useCartStore.setState({ items: [] });
  fetchMock.mockResolvedValue(Response.json({ add: [line('v-m', { quantity: 2 })], skipped: [] }));
});

const cart = () => useCartStore.getState().items;

describe('다시 담기', () => {
  it('담을 줄을 받아 장바구니에 넣는다', async () => {
    const user = userEvent.setup();
    render(<ReorderButton orderNo="20260915-1234567" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/orders/20260915-1234567/reorder');
    expect(cart()).toEqual([expect.objectContaining({ variantId: 'v-m', quantity: 2, selected: true })]);
    expect((await screen.findByRole('status')).textContent).toContain('1개 상품을 장바구니에 담았습니다.');
    expect(screen.getByRole('link', { name: '장바구니 보기' }).getAttribute('href')).toBe('/cart');
  });

  it('지금 담긴 옵션을 함께 보낸다 — 줄 수 상한을 서버가 따진다', async () => {
    const user = userEvent.setup();
    useCartStore.setState({
      items: [{ ...line('v-x'), quantity: 1, selected: true }],
    });
    render(<ReorderButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({ cartVariantIds: ['v-x'] });
  });

  it('담기로 센다 — 퍼널에서 빠지면 재구매가 보이지 않는다', async () => {
    const user = userEvent.setup();
    render(<ReorderButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    expect(track).toHaveBeenCalledWith('add_to_cart', { productId: 'p-1', variantId: 'v-m', quantity: 2 });
  });

  it('줄인 것과 못 담은 것을 까닭과 함께 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({
      add: [line('v-m', { quantity: 1, reduced: true })],
      skipped: [
        { productName: '린넨 셔츠', optionLabel: '화이트 / S', reason: 'SOLD_OUT' },
        { productName: '가죽 벨트', optionLabel: '블랙', reason: 'CANCELED' },
      ],
    }));
    render(<ReorderButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('울 코트 · 오트 / M — 재고가 모자라 1개만 담았습니다');
    expect(status.textContent).toContain('린넨 셔츠 · 화이트 / S — 품절입니다');
    expect(status.textContent).toContain('가죽 벨트 · 블랙 — 취소·반품한 상품이라 담지 않았습니다');
  });

  it('하나도 못 담았으면 그렇다고 말하고 장바구니로 보내지 않는다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({
      add: [],
      skipped: [{ productName: '린넨 셔츠', optionLabel: 'S', reason: 'UNAVAILABLE' }],
    }));
    render(<ReorderButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    expect((await screen.findByRole('status')).textContent).toContain('지금 담을 수 있는 상품이 없습니다.');
    expect(screen.queryByRole('link', { name: '장바구니 보기' })).toBeNull();
    expect(cart()).toEqual([]);
  });

  it('실패하면 알리고 아무것도 담지 않는다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ code: 'ORDER_NOT_FOUND', message: '주문을 찾을 수 없습니다.' }, { status: 404 }));
    render(<ReorderButton orderNo="O-1" />);

    await user.click(screen.getByRole('button', { name: '이 주문 다시 담기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문을 찾을 수 없습니다.');
    expect(cart()).toEqual([]);
  });
});
