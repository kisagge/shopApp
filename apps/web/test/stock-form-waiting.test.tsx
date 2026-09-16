// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const { StockForm } = await import('~/app/admin/products/stock-form');

/**
 * 재고 조정 표의 **재입고 대기** 칸.
 *
 * 무엇을 먼저 채울지는 남은 수만 보고 정할 일이 아니다 — 0 개인 옵션 둘 중 하나는
 * 열두 명이 기다리고 하나는 아무도 안 기다린다. 그 숫자를 **재고를 적는 바로 그 줄**에
 * 둔다. 다른 화면으로 보내면 채우는 사람이 거기까지 가지 않는다.
 */

const rows = [
  { id: 'v-1', sku: 'SKU-M', optionLabel: '오트 / M', stock: 0, isActive: true, waitingRestock: 12 },
  { id: 'v-2', sku: 'SKU-L', optionLabel: '오트 / L', stock: 4, isActive: true, waitingRestock: 0 },
];

const rowOf = (label: string) =>
  screen.getAllByRole('row').find((r) => within(r).queryByText(label) !== null)!;

describe('재입고 대기 칸', () => {
  it('기다리는 사람 수를 재고를 적는 줄에 적는다', () => {
    render(<StockForm productId="p-1" variants={rows} />);

    expect(within(rowOf('오트 / M')).getByText('12명')).toBeTruthy();
  });

  it('아무도 안 기다리면 0 대신 줄표 — 숫자면 기다리는 줄과 눈으로 구분되지 않는다', () => {
    render(<StockForm productId="p-1" variants={rows} />);

    const row = rowOf('오트 / L');
    expect(within(row).queryByText('0명')).toBeNull();
    expect(within(row).getByLabelText('기다리는 사람 없음')).toBeTruthy();
  });

  it('칸에 이름이 있다 — 숫자만 있으면 무엇을 세는지 알 수 없다', () => {
    render(<StockForm productId="p-1" variants={rows} />);

    expect(screen.getByRole('columnheader', { name: '재입고 대기' })).toBeTruthy();
  });

  it('재고 입력칸은 그대로다 — 칸을 더해도 적는 자리가 흔들리지 않는다', () => {
    render(<StockForm productId="p-1" variants={rows} />);

    expect(screen.getByLabelText('오트 / M 재고 수량')).toBeTruthy();
    expect(screen.getByLabelText('오트 / L 판매 여부')).toBeTruthy();
  });
});
