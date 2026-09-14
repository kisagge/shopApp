// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CancelItemsForm } = await import('~/components/cancel-items-form');

/**
 * 일부 상품 취소 폼.
 *
 * **돌려받을 금액은 서버에게 묻는다.** 판매가를 더해 보여 주면 쿠폰 몫·포인트·배송비 차감이
 * 빠진 숫자가 되고, 누르고 나서 금액이 달라진다.
 */

const ITEMS = [
  { id: 'i-coat', productName: '울 코트', optionLabel: '오트 / M', quantity: 1, subtotal: 60_000 },
  { id: 'i-knit', productName: '라운드 니트', optionLabel: '블랙 / L', quantity: 2, subtotal: 30_000 },
];

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string) as { preview?: boolean; itemIds: string[] };
    if (body.preview) {
      return json(200, body.itemIds.includes('i-coat')
        ? { kind: 'partial', cash: 48_000, points: 3_000, shippingDeducted: 3_000 }
        : { kind: 'partial', cash: 25_500, points: 1_500, shippingDeducted: 0 });
    }
    return json(200, { kind: 'partial', refunded: 25_500 });
  });
});

const open = async () => {
  render(<CancelItemsForm orderNo="20260914-0000001" items={ITEMS} />);
  await userEvent.click(screen.getByRole('button', { name: '일부 상품만 취소' }));
};

describe('구조', () => {
  it('열면 이름 붙은 폼으로 초점이 가고, 상품은 한 묶음의 체크박스다', async () => {
    await open();
    const form = screen.getByRole('form', { name: '취소할 상품' });
    expect(document.activeElement).toBe(form);
    expect(screen.getByRole('group', { name: '취소할 상품' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  });

  it('고른 것이 없으면 취소 단추가 잠기고 왜인지 말한다', async () => {
    await open();
    const submit = screen.getByRole('button', { name: '고른 상품 취소' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAccessibleDescription('취소할 상품을 골라 주세요.');
  });
});

describe('돌려받을 금액', () => {
  it('고르면 서버에게 묻고, 배송비 차감까지 보여 준다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));

    expect(await screen.findByText('48,000원')).toBeInTheDocument();
    expect(screen.getByText('3,000P')).toBeInTheDocument();
    expect(screen.getByText('-3,000원')).toBeInTheDocument();
    expect(screen.getByText(/무료배송 기준보다 적어져/)).toBeInTheDocument();

    const asked = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as { preview: boolean; itemIds: string[] };
    expect(asked).toMatchObject({ preview: true, itemIds: ['i-coat'] });
  });

  it('늦게 온 옛 답이 새로 고른 것의 금액을 덮지 않는다', async () => {
    let releaseSlow!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      releaseSlow = () => resolve(json(200, { kind: 'partial', cash: 48_000, points: 3_000, shippingDeducted: 3_000 }));
    }));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    expect(await screen.findByText('25,500원')).toBeInTheDocument();

    await act(async () => releaseSlow());
    expect(screen.queryByText('48,000원')).toBeNull();
  });

  it('남는 상품이 없으면 주문 전체가 취소된다고 알린다', async () => {
    fetchMock.mockImplementation(async () => json(200, { kind: 'full', cash: 85_000, points: 5_000, shippingDeducted: 0 }));
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    expect(await screen.findByText(/주문 전체가 취소됩니다/)).toBeInTheDocument();
  });
});

describe('취소', () => {
  it('고른 줄과 사유를 보내고, 끝나면 닫고 새로 그린다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as Record<string, unknown>;
    expect(sent).toEqual({ itemIds: ['i-knit'], reason: '단순 변심' });
    expect(screen.getByText('상품 1개를 취소했습니다.')).toBeInTheDocument();
    // 닫히면 여는 단추로 초점이 돌아온다
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '일부 상품만 취소' }));
  });

  it('거절되면 서버의 말을 보여 주고 열어 둔다', async () => {
    await open();
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await screen.findByText('25,500원');
    fetchMock.mockResolvedValueOnce(json(409, { message: '주문 전체를 취소해 주세요.' }));

    await userEvent.click(screen.getByRole('button', { name: '고른 상품 취소' }));

    expect((await screen.findByRole('alert')).textContent).toContain('주문 전체를 취소해 주세요.');
    expect(refresh).not.toHaveBeenCalled();
  });
});
