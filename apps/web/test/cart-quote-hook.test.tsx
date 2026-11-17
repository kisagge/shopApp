// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCartQuote, type QuoteInput } from '~/lib/use-cart-quote';

/**
 * 금액을 서버에 물어보는 훅. **문장 여덟이 전부 안 돌았다.**
 *
 * 화면이 직접 곱하고 더하면 서버가 계산한 결제 금액과 어긋나고, 그 차이는 결제
 * 직전에야 드러난다 — 그래서 이 훅이 있다. 그 말은 **장바구니에 보이는 숫자가
 * 전부 이 한 번의 왕복에서 나온다**는 뜻이고, 여기서 틀리면 화면 전체가 틀린다.
 *
 * 가장 조용한 고장은 **캐시 열쇠에 빠진 값**이다. 금액을 바꾸는 값이 열쇠에
 * 없으면 바꿔도 옛 금액이 그대로 보이고, 아무도 오류라고 말해 주지 않는다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();

const ITEMS = [
  { variantId: 'v-1', productId: 'p-1', productName: '코트', brand: 'MOOR', optionLabel: '오트 / M', listPrice: 100_000, salePrice: 90_000, quantity: 2, selected: true },
  { variantId: 'v-2', productId: 'p-2', productName: '니트', brand: 'MOOR', optionLabel: '블랙 / L', listPrice: 50_000, salePrice: null, quantity: 1, selected: true },
] as QuoteInput['items'];

function setup(input: QuoteInput) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const view = renderHook(() => useCartQuote(input), { wrapper });
  return { ...view, client };
}

const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ payable: 230_000 }), { status: 200 }));
});

describe('무엇을 보내는가', () => {
  it('줄에는 무엇과 몇 개만 담는다 — 금액은 화면이 말하지 않는다', async () => {
    /*
     * **값을 함께 보내면 그 값이 셈에 쓰일 길이 열린다.** 보내는 것은 "무엇을
     * 몇 개" 뿐이고, 값은 서버가 자기 표에서 읽는다.
     */
    setup({ items: ITEMS });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/cart/quote');
    expect(sent().lines).toEqual([
      { variantId: 'v-1', quantity: 2 },
      { variantId: 'v-2', quantity: 1 },
    ]);
  });

  it('먼 곳인지는 늘 적어 보낸다 — 안 적으면 서버가 아는 척하게 된다', async () => {
    setup({ items: ITEMS });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().isRemoteArea).toBe(false);
  });

  it('고른 쿠폰이 있으면 그것만 보낸다 — 안 보내면 서버가 가장 나은 것을 붙인다', async () => {
    setup({ items: ITEMS, couponCode: 'AUTUMN20' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().couponCode).toBe('AUTUMN20');
  });

  it('쿠폰 칸이 비어 있으면 아예 안 보낸다 — 빈 글자를 보내면 서버가 거절한다', async () => {
    /*
     * `undefined` 는 JSON 에서 저절로 빠지므로 이 조각이 갈리는 자리는 **빈
     * 글자**뿐이다(쿠폰 칸을 지운 경우). 안 보내면 서버가 가장 나은 것을 붙이고,
     * 빈 글자를 보내면 계약이 튕긴다 — 고르지 않은 것과 잘못 고른 것은 다르다.
     */
    setup({ items: ITEMS, couponCode: '' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty('couponCode');
  });

  it('쿠폰을 안 쓰겠다고 고른 때만 그 뜻을 보낸다', async () => {
    setup({ items: ITEMS, useCoupon: false });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().useCoupon).toBe(false);
  });

  it('쓰겠다는 것은 보내지 않는다 — 기본이 그쪽이다', async () => {
    setup({ items: ITEMS, useCoupon: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty('useCoupon');
  });

  it('쓸 포인트가 있을 때만 보낸다 — 0 은 안 쓰는 것과 같다', async () => {
    setup({ items: ITEMS, pointsToUse: 3_000 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent().pointsToUse).toBe(3_000);

    vi.clearAllMocks();
    setup({ items: ITEMS, pointsToUse: 0 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sent()).not.toHaveProperty('pointsToUse');
  });
});

describe('언제 묻는가', () => {
  it('빈 장바구니에는 묻지 않는다', () => {
    setup({ items: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('못 불러오면 실패로 둔다 — 조용히 0원을 내놓지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    const { result } = setup({ items: ITEMS });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toBe('견적을 불러오지 못했습니다');
  });
});

describe('캐시 열쇠', () => {
  /*
   * **금액을 바꾸는 값은 전부 열쇠에 있어야 한다.** 하나라도 빠지면 그 값을
   * 바꿨는데 옛 금액이 그대로 보인다 — 결제 직전에야 어긋남이 드러나는, 이 훅이
   * 애초에 막으려던 바로 그 상태다.
   */
  const FULL: QuoteInput = {
    items: ITEMS, couponCode: 'AUTUMN20', useCoupon: false,
    pointsToUse: 3_000, isRemoteArea: true,
  };

  const keyOf = (input: QuoteInput) => {
    const { client } = setup(input);
    return client.getQueryCache().getAll()[0]!.queryKey;
  };

  it('보내는 값이 모두 열쇠에 들어 있다', async () => {
    const key = keyOf(FULL);
    const flat = JSON.stringify(key);

    expect(key[0]).toBe('cart-quote');
    for (const value of ['AUTUMN20', 'v-1', 3000, false, true]) {
      expect(flat, `${String(value)} 가 열쇠에 없다`).toContain(JSON.stringify(value));
    }
  });

  it.each([
    ['수량', { items: [{ ...ITEMS[0]!, quantity: 5 }] as QuoteInput['items'] }],
    ['쿠폰', { couponCode: 'WINTER10' }],
    ['쿠폰을 쓸지', { useCoupon: true }],
    ['포인트', { pointsToUse: 1_000 }],
    ['먼 곳인지', { isRemoteArea: false }],
  ])('%s 가 바뀌면 열쇠도 바뀐다', (_what, change) => {
    const before = JSON.stringify(keyOf(FULL));
    const after = JSON.stringify(keyOf({ ...FULL, ...change }));

    expect(after).not.toBe(before);
  });
});
