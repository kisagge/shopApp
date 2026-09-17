// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { StockForm } = await import('~/app/admin/products/stock-form');

/**
 * 재고 조정 표의 **저장**.
 *
 * 예전에는 모든 줄을 화면을 연 때의 숫자로 보내서, 한 줄을 고치면 나머지 줄의 그사이 팔린 수량이
 * 되살아났다. 고친 줄만, 읽었던 재고와 함께 보낸다.
 */

const rows = [
  { id: 'v-1', sku: 'SKU-M', optionLabel: '오트 / M', stock: 3, isActive: true, waitingRestock: 0 },
  { id: 'v-2', sku: 'SKU-L', optionLabel: '오트 / L', stock: 4, isActive: true, waitingRestock: 0 },
];

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ updated: 1 }));
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as unknown;

describe('저장', () => {
  it('고친 줄만 읽었던 재고와 함께 보낸다', async () => {
    const user = userEvent.setup();
    render(<StockForm productId="p-1" variants={rows} />);

    const input = screen.getByLabelText('오트 / M 재고 수량');
    await user.clear(input);
    await user.type(input, '10');
    await user.click(screen.getByRole('button', { name: '재고 반영' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/products/p-1/stock');
    expect(sentBody()).toEqual({
      variants: [{ variantId: 'v-1', stock: 10, isActive: true, expectedStock: 3 }],
    });
  });

  it('판매 여부만 바꿔도 그 줄의 읽었던 재고를 함께 보낸다', async () => {
    const user = userEvent.setup();
    render(<StockForm productId="p-1" variants={rows} />);

    await user.click(screen.getByLabelText('오트 / L 판매 여부'));
    await user.click(screen.getByRole('button', { name: '재고 반영' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toEqual({
      variants: [{ variantId: 'v-2', stock: 4, isActive: false, expectedStock: 4 }],
    });
  });

  it('그사이 재고가 바뀌었으면 까닭을 말하고 다시 읽어 온다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json(
      { code: 'STOCK_CHANGED', message: '읽은 뒤 재고가 바뀌었습니다' }, { status: 409 },
    ));
    render(<StockForm productId="p-1" variants={rows} />);

    await user.click(screen.getByLabelText('오트 / M 판매 여부'));
    await user.click(screen.getByRole('button', { name: '재고 반영' }));

    expect((await screen.findByRole('status')).textContent).toBe('읽은 뒤 재고가 바뀌었습니다');
    expect(refresh).toHaveBeenCalled();
  });

  it('다른 실패는 다시 읽지 않는다 — 고친 값을 그대로 두어 다시 누를 수 있게', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ message: '권한이 없습니다' }, { status: 403 }));
    render(<StockForm productId="p-1" variants={rows} />);

    await user.click(screen.getByLabelText('오트 / M 판매 여부'));
    await user.click(screen.getByRole('button', { name: '재고 반영' }));

    await screen.findByRole('status');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('다시 읽어 온 재고', () => {
  it('서버 값이 바뀌면 입력칸도 새 숫자로 맞춘다 — 옛 숫자로 또 저장하지 않게', () => {
    const { rerender } = render(<StockForm productId="p-1" variants={rows} />);

    rerender(<StockForm productId="p-1" variants={[{ ...rows[0]!, stock: 1 }, rows[1]!]} />);

    expect(screen.getByLabelText<HTMLInputElement>('오트 / M 재고 수량').value).toBe('1');
    // 바뀐 것이 없으니 누를 것도 없다
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '재고 반영' }).disabled).toBe(true);
  });

  it('같은 값으로 다시 그리면 고치던 숫자를 지우지 않는다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<StockForm productId="p-1" variants={rows} />);
    const input = screen.getByLabelText<HTMLInputElement>('오트 / M 재고 수량');
    await user.clear(input);
    await user.type(input, '9');

    rerender(<StockForm productId="p-1" variants={rows.map((r) => ({ ...r }))} />);

    expect(input.value).toBe('9');
  });
});
