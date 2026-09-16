// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCartStore } from '~/stores/cart';

const { CartOptionChange } = await import('~/components/cart-option-change');

/**
 * 장바구니 줄의 옵션 바꾸기 칸.
 *
 * 품절 줄에서 할 수 있는 일이 지우기뿐이었다. 같은 상품의 다른 옵션으로 그 자리에서 바꾼다.
 */

const coatL = {
  variantId: 'v-l', productId: 'p-1', productName: '울 코트', brand: '무어',
  optionLabel: '오트 / L', listPrice: 413_000, salePrice: 289_000,
};

const options = {
  productId: 'p-1', productName: '울 코트', brandName: '무어', listPrice: 413_000,
  imageUrl: '/coat.jpg', blurDataUrl: null,
  options: [
    { variantId: 'v-l', label: '오트 / L', unitPrice: 289_000, stock: 0, available: false },
    { variantId: 'v-m', label: '오트 / M', unitPrice: 289_000, stock: 4, available: true },
    { variantId: 'v-s', label: '오트 / S', unitPrice: 289_000, stock: 0, available: false },
  ],
};

const fetchMock = vi.fn<(...a: any[]) => any>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json(options));
  localStorage.clear();
  useCartStore.setState({ items: [{ ...coatL, quantity: 2, selected: true }] });
});

const item = () => useCartStore.getState().items[0]!;

function Harness({ onChanged = vi.fn() }: { onChanged?: (m: string) => void }) {
  // 실제 장바구니처럼 줄이 옵션을 열쇠로 다시 그려지게 둔다
  const items = useCartStore((s) => s.items);
  return (
    <>
      {items.map((i) => (
        <CartOptionChange key={i.variantId} item={i} prominent onChanged={onChanged} />
      ))}
    </>
  );
}

describe('옵션 바꾸기 칸', () => {
  it('처음에는 닫혀 있고 옵션을 읽지 않는다 — 대부분의 줄은 한 번도 안 연다', () => {
    render(<Harness />);

    const button = screen.getByRole('button', { name: '울 코트 옵션 변경' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('열면 이 줄의 옵션을 읽는다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/cart/options?variantId=v-l');
    expect(await screen.findByLabelText('바꿀 옵션')).toBeTruthy();
    expect(screen.getByRole('button', { name: '울 코트 옵션 변경' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('품절인 옵션도 보이되 고를 수 없다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));

    const select = await screen.findByLabelText<HTMLSelectElement>('바꿀 옵션');
    const byText = (text: string) => [...select.options].find((o) => o.textContent === text)!;

    expect(byText('오트 / S (품절)').disabled).toBe(true);
    expect(byText('오트 / M').disabled).toBe(false);
    // 지금 옵션은 무엇에서 바꾸는지 보여 주려고 남긴다
    expect(byText('오트 / L (지금 담긴 옵션)').selected).toBe(true);
  });

  it('다른 옵션을 고르기 전에는 바꾸기를 누를 수 없다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));
    await screen.findByLabelText('바꿀 옵션');

    expect(screen.getByRole<HTMLButtonElement>('button', { name: '바꾸기' }).disabled).toBe(true);
  });

  it('바꾸면 줄이 새 옵션이 되고, 무엇으로 바꿨는지 말하고, 초점이 새 줄의 단추로 간다', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    render(<Harness onChanged={onChanged} />);
    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));

    await user.selectOptions(await screen.findByLabelText('바꿀 옵션'), 'v-m');
    await user.click(screen.getByRole('button', { name: '바꾸기' }));

    expect(item()).toMatchObject({ variantId: 'v-m', optionLabel: '오트 / M', quantity: 2 });
    expect(onChanged).toHaveBeenCalledWith('울 코트 옵션을 바꿨습니다 — 오트 / M');
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('cart-option-v-m');
    });
  });

  it('다른 옵션이 없으면 그렇다고 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ ...options, options: [options.options[0]] }));
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));

    expect(await screen.findByText('바꿀 수 있는 다른 옵션이 없습니다.')).toBeTruthy();
  });

  it('읽지 못하면 알린다 — 빈 칸으로 두지 않는다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));

    expect((await screen.findByRole('alert')).textContent).toContain('옵션을 불러오지 못했습니다');
  });

  it('닫기를 누르면 접힌다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '울 코트 옵션 변경' }));
    await screen.findByLabelText('바꿀 옵션');

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.getByRole('button', { name: '울 코트 옵션 변경' }).getAttribute('aria-expanded')).toBe('false');
  });
});
