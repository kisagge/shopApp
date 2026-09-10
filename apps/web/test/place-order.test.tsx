// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ko } from '@shop/i18n/messages/ko';
import { LocaleProvider } from '~/lib/i18n/client';
import type { CartItem } from '~/stores/cart';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const track = vi.hoisted(() => vi.fn());
vi.mock('~/lib/analytics/client', () => ({ track }));
vi.mock('~/lib/analytics/session', () => ({
  getSessionId: () => 'sess_abcdefgh',
  getAnonymousId: () => 'anon_abcdefgh',
}));

const openPaymentWindow = vi.hoisted(() => vi.fn());
vi.mock('~/lib/payments/client', () => ({ openPaymentWindow }));

const { usePlaceOrder } = await import('~/lib/checkout/place-order');
const { useCartStore } = await import('~/stores/cart');

/**
 * 주문 만들기부터 결제 승인까지.
 *
 * 요청이 둘이고 그 사이에 브라우저가 다른 곳으로 떠날 수 있는 흐름이라
 * 화면에서 떼어 냈는데, **떼어 낸 뒤로 아무도 보지 않고 있었다.** 여기가
 * 틀리면 주문이 두 번 만들어지거나 장바구니가 사라진다 — 둘 다 사용자가
 * 나중에야 알아채는 종류다.
 */

const item = (variantId: string): CartItem => ({
  variantId,
  productId: `p-${variantId}`,
  productName: '오버사이즈 울 블렌드 코트',
  brand: 'STUDIO NOON',
  optionLabel: '오트밀 / M',
  listPrice: 413_000,
  salePrice: 289_000,
  quantity: 1,
  selected: true,
});

const input = (items: readonly CartItem[]) => ({
  items,
  addressId: 'addr-1',
  memo: '',
  pointsToUse: 0,
  method: 'CARD' as const,
  payable: 289_000,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocaleProvider locale="ko" dict={ko}>{children}</LocaleProvider>
);

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const fail = (body: unknown, status = 400) => new Response(JSON.stringify(body), { status });

/** 주문 생성은 성공, 승인도 성공 */
function happyPath() {
  vi.mocked(fetch)
    .mockResolvedValueOnce(ok({ orderNo: '20260909-0000001', payable: 289_000 }))
    .mockResolvedValueOnce(ok({}));
}

const bodyOf = (call: number) =>
  JSON.parse((vi.mocked(fetch).mock.calls[call]?.[1] as RequestInit).body as string) as Record<
    string,
    unknown
  >;

beforeEach(() => {
  vi.clearAllMocks();
  useCartStore.setState({ items: [] });
  vi.stubGlobal('fetch', vi.fn());
});

describe('같은 시도는 한 번만', () => {
  /**
   * 열쇠가 매번 새로 만들어지면 **있어도 없는 것과 같다.** 두 번 눌렀을 때
   * 서버는 그것이 같은 시도인 줄 알 방법이 없고, 주문이 둘 생긴다.
   */
  it('두 번 보내도 멱등 열쇠가 같다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });
    const first = bodyOf(0)['idempotencyKey'];

    vi.mocked(fetch).mockClear();
    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(bodyOf(0)['idempotencyKey']).toBe(first);
    expect(first).toEqual(expect.any(String));
  });

  it('훅이 다시 태어나면 새 열쇠다 — 다음 결제는 다른 시도다', async () => {
    const a = renderHook(() => usePlaceOrder('mock'), { wrapper });
    happyPath();
    await act(async () => { await a.result.current.place(input([item('v1')])); });
    const first = bodyOf(0)['idempotencyKey'];

    vi.mocked(fetch).mockClear();
    const b = renderHook(() => usePlaceOrder('mock'), { wrapper });
    happyPath();
    await act(async () => { await b.result.current.place(input([item('v1')])); });

    expect(bodyOf(0)['idempotencyKey']).not.toBe(first);
  });
});

describe('장바구니', () => {
  it('주문에 들어간 것만 뺀다 — 고르지 않은 줄은 남는다', async () => {
    useCartStore.setState({ items: [item('v1'), item('v2')] });
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(useCartStore.getState().items.map((i) => i.variantId)).toEqual(['v2']);
  });

  /** 주문이 안 만들어졌는데 장바구니가 비면 담은 것을 처음부터 다시 골라야 한다. */
  it('주문이 실패하면 건드리지 않는다', async () => {
    useCartStore.setState({ items: [item('v1')] });
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ code: 'OUT_OF_STOCK', message: '재고가 없습니다' }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(useCartStore.getState().items).toHaveLength(1);
  });

  /** 주문은 이미 만들어졌다. 승인만 실패했으므로 다시 담게 하면 두 번 주문한다. */
  it('승인이 실패해도 뺀 것은 되돌리지 않는다', async () => {
    useCartStore.setState({ items: [item('v1')] });
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch)
      .mockResolvedValueOnce(ok({ orderNo: '20260909-0000001', payable: 289_000 }))
      .mockResolvedValueOnce(fail({ message: '승인 실패' }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(useCartStore.getState().items).toEqual([]);
  });
});

describe('실패했을 때', () => {
  it('재고가 모자랄 때만 견적을 다시 받으라고 한다 — 그때만 금액이 달라진다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ code: 'OUT_OF_STOCK', message: '재고가 없습니다' }));
    let out = await act(async () => result.current.place(input([item('v1')])));
    expect(out).toEqual({ refetchQuote: true });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ code: 'ADDRESS_NOT_FOUND', message: '주소가 없습니다' }));
    out = await act(async () => result.current.place(input([item('v1')])));
    expect(out).toEqual({ refetchQuote: false });
  });

  it('서버가 준 말을 그대로 보여 준다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ code: 'OUT_OF_STOCK', message: '재고가 없습니다' }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(result.current.error).toBe('재고가 없습니다');
  });

  it('말이 없으면 우리 문구로 채운다 — 빈 오류를 띄우지 않는다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({}));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(result.current.error).toBeTruthy();
    expect(result.current.error).not.toMatch(/^checkout\./);
  });

  it('승인이 실패하면 주문 화면에서 다시 하라고 알려 준다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch)
      .mockResolvedValueOnce(ok({ orderNo: '20260909-0000001', payable: 289_000 }))
      .mockResolvedValueOnce(fail({ message: '승인 실패' }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(result.current.error).toContain('승인 실패');
    // 주문은 만들어졌다. 주문 화면으로 보내야 다시 시도할 수 있다.
    expect(push).toHaveBeenCalledWith('/order/20260909-0000001');
  });

  it('앞선 오류는 다시 보낼 때 지운다 — 성공했는데 빨간 글씨가 남으면 안 된다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ message: '재고가 없습니다' }));
    await act(async () => { await result.current.place(input([item('v1')])); });
    expect(result.current.error).toBeTruthy();

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });
    expect(result.current.error).toBeNull();
  });
});

describe('보내는 값', () => {
  it('빈 메모와 0 포인트는 아예 넣지 않는다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => {
      await result.current.place({ ...input([item('v1')]), memo: '   ', pointsToUse: 0 });
    });

    expect(bodyOf(0)).not.toHaveProperty('deliveryMemo');
    expect(bodyOf(0)).not.toHaveProperty('pointsToUse');
  });

  it('메모의 앞뒤 공백은 떼고 보낸다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => {
      await result.current.place({ ...input([item('v1')]), memo: '  문 앞에  ' });
    });

    expect(bodyOf(0)['deliveryMemo']).toBe('문 앞에');
  });

  /** 퍼널을 이어 붙이려면 조회·담기와 같은 세션이어야 한다 */
  it('퍼널을 잇는 세션 열쇠를 함께 보낸다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(bodyOf(0)['browserSessionId']).toBe('sess_abcdefgh');
  });

  it('결제 수단을 고른 것을 이벤트로 남긴다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(track).toHaveBeenCalledWith('add_payment_info', { method: 'CARD' });
  });

  it('주문이 실패하면 결제 수단 이벤트도 남기지 않는다', async () => {
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(fail({ message: '실패' }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(track).not.toHaveBeenCalled();
  });
});

/**
 * **결제창을 띄울지는 서버가 정한다.**
 *
 * 예전에는 이 훅이 클라이언트 키를 직접 보고 정했다. 서버는 시크릿 키를
 * 보고 정하고 있었고, 배포에는 두 키가 다 없었다 — 브라우저는 "Mock 으로
 * 간다", 서버는 "프로덕션에서 Mock 은 못 쓴다" 로 갈렸다. 주문은 만들어지고
 * 확정만 500 이 났다(20260910-7063897 이 입금대기로 남았다).
 *
 * 그래서 여기서 확인하는 것은 **키가 있느냐가 아니라 `mode` 를 따르느냐**다.
 */
describe('결제창은 서버가 내려 준 결론을 따른다', () => {
  const KEY = 'test_ck_abcdefghijklmnopqrstuvwx';

  it('mock 이면 클라이언트 키가 있어도 창을 띄우지 않고 확정까지 간다', async () => {
    vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
    const { result } = renderHook(() => usePlaceOrder('mock'), { wrapper });

    happyPath();
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(openPaymentWindow).not.toHaveBeenCalled();
    // 두 번째 요청이 승인이다 — 창 없이 서버가 확정한다
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toContain('/confirm');
    vi.unstubAllEnvs();
  });

  it('window 면 창을 띄우고, 승인은 부르지 않는다 — 리다이렉트로 이어진다', async () => {
    vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
    openPaymentWindow.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => usePlaceOrder('window'), { wrapper });

    vi.mocked(fetch).mockResolvedValueOnce(ok({ orderNo: '20260909-0000001', payable: 289_000 }));
    await act(async () => { await result.current.place(input([item('v1')])); });

    expect(openPaymentWindow).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    vi.unstubAllEnvs();
  });

  /**
   * 창을 못 띄우면서 **Mock 으로 빠지지도 않아야 한다.** 간편결제는 토스에서
   * 제공사를 함께 지정해야 하는데 그 연동이 아직 없다 — 결제창도 안 뜨는데
   * 주문만 결제 완료가 되는 것이 가장 나쁘다. 화면은 이 수단을 아예 감춘다.
   */
  it('window 인데 간편결제면 창을 띄우지 않는다', async () => {
    vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
    const { result } = renderHook(() => usePlaceOrder('window'), { wrapper });

    happyPath();
    await act(async () => {
      await result.current.place({ ...input([item('v1')]), method: 'EASY_PAY' as const });
    });

    expect(openPaymentWindow).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
