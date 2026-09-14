// @vitest-environment jsdom
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { CartSync } = await import('~/components/cart-sync');
const { useCartStore } = await import('~/stores/cart');
import type { CartItem } from '~/stores/cart';

const line = (variantId: string, quantity = 1): CartItem => ({
  variantId,
  productId: 'p1',
  productName: '오트 코트',
  brand: 'STUDIO NOON',
  optionLabel: '오트 / M',
  listPrice: 413000,
  salePrice: 289000,
  quantity,
  selected: true,
});

/** 누구인지는 서버가 넘겨 준다 — 화면이 직접 묻지 않는다. */
const asUser = (id: string | null) => <CartSync userId={id} />;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  useCartStore.setState({ items: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const calls = (method: string) =>
  vi.mocked(fetch).mock.calls.filter(([, init]) => (init as RequestInit)?.method === method);

/**
 * 장바구니를 서버와 맞추는 자리.
 *
 * 화면이 없어서(항상 null 을 돌려준다) 눈으로는 아무것도 확인할 수 없다.
 * 그런데 여기가 틀리면 **다른 기기에 담아 둔 것이 조용히 사라진다** —
 * 사용자는 없어진 줄도 모르고, 우리는 로그를 봐도 정상적인 저장으로 보인다.
 */
describe('장바구니 서버 맞추기', () => {
  it('비로그인은 서버를 부르지 않는다', async () => {
    // 지금까지처럼 localStorage 만 쓴다. 계정이 없으면 맞출 대상이 없다.
    render(asUser(null));
    await act(async () => {});

    expect(fetch).not.toHaveBeenCalled();
  });

  it('로그인하면 한 번만 병합한다', async () => {
    const view = render(asUser('u1'));
    await act(async () => {});
    view.rerender(asUser('u1'));
    await act(async () => {});

    // 다시 그릴 때마다 병합하면 로컬 것이 계속 서버로 밀려 들어간다
    expect(calls('POST')).toHaveLength(1);
  });

  it('병합이 끝나기 전의 변경은 서버로 밀지 않는다', async () => {
    // 서버 것을 아직 못 받은 상태로 덮어쓰면 다른 기기의 장바구니가 날아간다.
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {})); // 병합이 안 끝난다
    render(asUser('u1'));

    act(() => {
      useCartStore.setState({ items: [line('v1')] });
    });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(calls('PUT')).toHaveLength(0);
  });

  it('병합을 기다리는 사이 담은 것은 병합 결과에 묻히지 않는다', async () => {
    /*
     * **실제로 사라지고 있었다.** 로그인한 손님이 화면이 뜨자마자 담기를 누르면
     * 병합 전이라 저장은 건너뛰고(위 검사), 곧 도착한 병합 응답이 스토어를 서버
     * 것으로 통째로 갈아 끼웠다 — 방금 담은 상품이 아무 말 없이 없어진다. 느린
     * 기계일수록 병합이 늦어 틈이 벌어지고, 새 DB 에서 도는 문지기가 그렇게 잡았다.
     */
    let finish!: (r: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(asUser('u1'));

    act(() => {
      useCartStore.setState({ items: [line('v-new')] });
    });
    await act(async () => {
      // 다른 기기에서 담아 둔 것이 서버에 있었다
      finish(new Response(JSON.stringify({ items: [line('v-other', 2)] }), { status: 200 }));
    });

    const kept = useCartStore.getState().items.map((i) => [i.variantId, i.quantity]);
    expect(kept).toEqual([['v-other', 2], ['v-new', 1]]);

    // 합친 것은 서버에도 남아야 한다 — 새로고침하면 다시 사라지면 안 된다
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    const saved = JSON.parse(calls('PUT').at(-1)![1]!.body as string) as { lines: { variantId: string }[] };
    expect(saved.lines.map((l) => l.variantId)).toEqual(['v-other', 'v-new']);
  });

  it('병합을 기다리는 사이 뺀 것은 병합 결과에서도 빠진다', async () => {
    useCartStore.setState({ items: [line('v1')] });
    let finish!: (r: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(asUser('u1'));

    act(() => {
      useCartStore.setState({ items: [] });
    });
    await act(async () => {
      finish(new Response(JSON.stringify({ items: [line('v1')] }), { status: 200 }));
    });

    expect(useCartStore.getState().items).toEqual([]);
  });

  it('연타는 한 번으로 몰아서 보낸다', async () => {
    render(asUser('u1'));
    await act(async () => {});

    for (let quantity = 1; quantity <= 5; quantity += 1) {
      act(() => {
        useCartStore.setState({ items: [line('v1', quantity)] });
      });
    }
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // 수량 버튼을 다섯 번 눌렀다고 요청이 다섯 번 나가면 안 된다
    expect(calls('PUT')).toHaveLength(1);
  });

  it('내용이 같으면 저장하지 않는다', async () => {
    render(asUser('u1'));
    await act(async () => {});

    act(() => {
      useCartStore.setState({ items: [] }); // 병합 결과와 같다
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(calls('PUT')).toHaveLength(0);
  });

  it('로그아웃하면 다음 로그인 때 다시 병합한다', async () => {
    const view = render(asUser('u1'));
    await act(async () => {});
    expect(calls('POST')).toHaveLength(1);

    view.rerender(asUser(null));
    await act(async () => {});

    // 다른 사람이 같은 브라우저를 쓸 수 있다. 앞사람 것을 물려주면 안 된다.
    view.rerender(asUser('u2'));
    await act(async () => {});

    expect(calls('POST')).toHaveLength(2);
  });
});
