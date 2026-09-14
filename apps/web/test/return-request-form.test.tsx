// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from './render';
import { ReturnRequestForm } from '~/components/return-request-form';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

/**
 * 반품 신청 폼.
 *
 * **고를 수 있는 것만 내민다.** 구매확정한 주문에서 단순 변심이 기본값으로
 * 선택돼 있으면, 사람은 그것을 골라 제출하고 나서야 안 된다는 말을 듣는다.
 */
const open = async (status: 'DELIVERED' | 'CONFIRMED') => {
  render(<ReturnRequestForm orderNo="20260909-0000001" status={status} />);
  const { default: userEvent } = await import('@testing-library/user-event');
  await userEvent.click(screen.getByRole('button', { name: /반품|교환/ }));
};

describe('고를 수 있는 사유만 보인다', () => {
  it('배송완료 뒤에는 단순 변심도 고를 수 있다', async () => {
    await open('DELIVERED');

    expect(screen.getByRole('radio', { name: /단순 변심/ })).toBeInTheDocument();
  });

  it('구매확정 뒤에는 단순 변심이 아예 없다', async () => {
    await open('CONFIRMED');

    expect(screen.queryByRole('radio', { name: /단순 변심/ })).toBeNull();
    expect(screen.getByRole('radio', { name: /불량/ })).toBeInTheDocument();
  });

  /** 고를 수 없는 것이 기본값이면 아무것도 안 바꾼 사람이 거절당한다 */
  it('구매확정 뒤에는 판매자 귀책이 처음부터 골라져 있다', async () => {
    await open('CONFIRMED');

    const checked = screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked);
    expect(checked).toHaveLength(2); // 종류(반품/교환) 하나, 사유 하나
    expect(checked.some((r) => /단순 변심/.test(r.getAttribute('aria-label') ?? ''))).toBe(false);
  });

  /** 누가 반송비를 내는지는 사유가 정한다. 확정 뒤에는 전부 판매자 귀책이다. */
  it('반송비를 우리가 낸다고 말해 준다', async () => {
    await open('CONFIRMED');

    expect(screen.getByText(/반송비는 저희가 부담합니다/)).toBeInTheDocument();
  });
});

describe('돌려보낼 상품 고르기', () => {
  const ITEMS = [
    { id: 'i-coat', productName: '울 코트', optionLabel: '오트 / M', quantity: 1 },
    { id: 'i-knit', productName: '라운드 니트', optionLabel: '블랙 / L', quantity: 1 },
  ];

  const openWith = async (items = ITEMS) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ orderNo: 'x' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReturnRequestForm orderNo="20260909-0000001" status="DELIVERED" items={items} />);
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: /반품|교환/ }));
    return { fetchMock, userEvent };
  };

  it('상품이 둘 이상이면 한 묶음의 체크박스로 보여 주고, 처음엔 전부 골라 둔다', async () => {
    await openWith();
    const group = screen.getByRole('group', { name: '돌려보낼 상품' });
    expect(group).toHaveAccessibleDescription('고르지 않은 상품은 받은 그대로 둡니다.');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);
  });

  it('고른 상품만 보낸다 — 니트만 작으면 니트만 돌려보낸다', async () => {
    const { fetchMock, userEvent } = await openWith();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await userEvent.click(screen.getByRole('button', { name: '신청하기' }));

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.itemIds).toEqual(['i-knit']);
  });

  it('하나도 안 고르면 보내지 않고 이유를 말한다', async () => {
    const { fetchMock, userEvent } = await openWith();
    await userEvent.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /라운드 니트/ }));
    await userEvent.click(screen.getByRole('button', { name: '신청하기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('돌려보낼 상품을 골라 주세요.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('상품이 하나면 고르지 않는다 — 물을 것이 없다', async () => {
    const { fetchMock, userEvent } = await openWith([ITEMS[0]!]);
    expect(screen.queryByRole('group', { name: '돌려보낼 상품' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '신청하기' }));
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.itemIds).toBeUndefined();
  });
});

describe('교환은 줄마다 바꿀 옵션을 고른다', () => {
  const items = [
    {
      id: 'i-knit', productName: '메리노 터틀넥', optionLabel: '블랙 / S', quantity: 1, variantId: 'v-s',
      exchangeOptions: [{ variantId: 'v-s', label: '블랙 / S' }, { variantId: 'v-m', label: '블랙 / M' }],
    },
    { id: 'i-coat', productName: '울 코트', optionLabel: '오트 / M', quantity: 1, variantId: 'v-coat', exchangeOptions: [] },
  ];

  const openExchange = async () => {
    const fetchMock = vi.fn(async () => Response.json({}));
    vi.stubGlobal('fetch', fetchMock);
    render(<ReturnRequestForm orderNo="20260909-0000001" status="DELIVERED" items={items} />);
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /반품|교환/ }));
    await user.click(screen.getByRole('radio', { name: '교환' }));
    return { user, fetchMock };
  };

  it('반품이면 옵션 칸이 없고, 교환이면 이름 붙은 선택 칸이 뜨며 처음에는 다른 옵션이 골라져 있다', async () => {
    render(<ReturnRequestForm orderNo="20260909-0000001" status="DELIVERED" items={items} />);
    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: /반품|교환/ }));
    expect(screen.queryByRole('group', { name: '바꿀 옵션' })).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: '교환' }));

    const group = screen.getByRole('group', { name: '바꿀 옵션' });
    const select = screen.getByLabelText<HTMLSelectElement>('메리노 터틀넥 (블랙 / S) — 바꿀 옵션');
    expect(group).toContainElement(select);
    expect(select.value).toBe('v-m');
    expect(screen.getByRole('option', { name: '블랙 / S (같은 옵션으로 새 상품)' })).toBeInTheDocument();
  });

  it('바꿀 옵션이 없는 줄은 그렇다고 말하고, 그 줄이 들어가면 보내지 않는다', async () => {
    const { user, fetchMock } = await openExchange();
    expect(screen.getByText(/울 코트 은\(는\) 바꿀 수 있는 옵션이 없습니다/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '신청하기' }));
    expect(screen.getByRole('alert').textContent).toContain('울 코트');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('교환할 줄만 고르면 줄마다 고른 옵션을 함께 보낸다', async () => {
    const { user, fetchMock } = await openExchange();
    await user.click(screen.getByRole('checkbox', { name: /울 코트/ }));
    await user.selectOptions(screen.getByLabelText('메리노 터틀넥 (블랙 / S) — 바꿀 옵션'), 'v-s');
    await user.click(screen.getByRole('button', { name: '신청하기' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body).toMatchObject({ type: 'EXCHANGE', itemIds: ['i-knit'], exchanges: [{ itemId: 'i-knit', variantId: 'v-s' }] });
  });
});
