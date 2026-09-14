// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));

const { ProductOptions } = await import('~/components/product-options');

/**
 * 품절 옵션.
 *
 * **고를 수 있어야 한다.** 막아 두면(aria-disabled, 클릭 무시) 품절 옵션을 골라야 뜨는 재입고 알림 신청이 어디서도 열리지
 * 않는다 — 실제로 그랬다. 고를 수 있되, 품절이라는 것이 이름에 함께 읽히고, 담기 대신 재입고 알림이 뜬다.
 */
const product = {
  id: 'p-1',
  name: '나일론 코치 자켓',
  brand: 'PLAIN LABEL',
  listPrice: 129_000,
  optionGroups: [
    { id: 'g-c', name: '색상', values: [{ id: 'c-b', value: '블랙' }, { id: 'c-i', value: '아이보리' }] },
    { id: 'g-s', name: '사이즈', values: [{ id: 's-m', value: 'M' }, { id: 's-xl', value: 'XL' }] },
  ],
  variants: [
    { id: 'v-bm', label: '블랙 / M', price: 129_000, stock: 3, optionValueIds: ['c-b', 's-m'] },
    { id: 'v-bxl', label: '블랙 / XL', price: 129_000, stock: 2, optionValueIds: ['c-b', 's-xl'] },
    { id: 'v-im', label: '아이보리 / M', price: 129_000, stock: 4, optionValueIds: ['c-i', 's-m'] },
    { id: 'v-ixl', label: '아이보리 / XL', price: 129_000, stock: 0, optionValueIds: ['c-i', 's-xl'] },
  ],
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
});

describe('품절 옵션', () => {
  it('고른 색에서 품절인 사이즈는 이름에 "품절" 이 붙지만 막히지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.click(screen.getByRole('radio', { name: '아이보리' }));
    const xl = screen.getByRole('radio', { name: 'XL 품절' });
    expect(xl.hasAttribute('aria-disabled')).toBe(false);
    expect(screen.getByRole('radio', { name: 'M' })).toBeTruthy();
  });

  it('품절 옵션을 고르면 담기·수량 대신 그 옵션의 재입고 알림 신청이 뜬다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.click(screen.getByRole('radio', { name: '아이보리' }));
    await user.click(screen.getByRole('radio', { name: 'XL 품절' }));

    expect(screen.getByRole('radio', { name: 'XL 품절' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByRole('button', { name: '장바구니 담기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /수량 늘리기|increase/i })).toBeNull();

    await user.click(screen.getByRole('button', { name: '아이보리 / XL 재입고 알림 신청' }));
    expect(await screen.findByRole('button', { name: '아이보리 / XL 재입고 알림 해제' })).toBeTruthy();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/api/restock/v-ixl', { method: 'PUT' });
  });

  it('재고 있는 옵션으로 돌아가면 다시 담을 수 있다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.click(screen.getByRole('radio', { name: '아이보리' }));
    await user.click(screen.getByRole('radio', { name: 'XL 품절' }));
    await user.click(screen.getByRole('radio', { name: 'M' }));
    expect(screen.getByRole('button', { name: '장바구니 담기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /재입고 알림/ })).toBeNull();
  });
});
