// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const openPaymentWindow = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/payments/client', () => ({ openPaymentWindow }));
vi.mock('~/lib/analytics/session', () => ({ getAnonymousId: () => 'anon_abcdefgh' }));

const { payOrder, orderNameOf } = await import('~/lib/checkout/pay-order');

/**
 * 이미 만들어진 주문에 결제를 거는 **하나뿐인 자리.**
 *
 * 주문 만들기와 다시 걸기가 같은 함수를 쓴다. 두 곳에 따로 적으면 갈리는데,
 * 결제 방식을 브라우저와 서버가 따로 정하다 갈려서 승인이 500 이 났던 것이
 * 바로 그 모양이었다(주문 20260910-7063897).
 */
const base = {
  orderNo: '20260910-7063897',
  payable: 71_000,
  orderName: '코튼 트윌 와이드 팬츠',
} as const;

const KEY = 'test_ck_abcdefghijklmnopqrstuvwx';
const bodyOf = (call = 0) =>
  JSON.parse((vi.mocked(fetch).mock.calls[call]![1] as RequestInit).body as string) as {
    paymentKey: string;
    amount: number;
  };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  vi.unstubAllEnvs();
});

describe('결제 걸기', () => {
  describe('결제창', () => {
    it('window 면 창을 열고 승인은 부르지 않는다 — 승인은 돌아온 뒤 서버가 한다', async () => {
      vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
      openPaymentWindow.mockResolvedValueOnce(undefined);

      const r = await payOrder({ ...base, mode: 'window', method: 'CARD' });

      expect(r).toEqual({ kind: 'window' });
      expect(openPaymentWindow).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
    });

    it('창을 못 열면 그렇다고 답한다 — 주문은 그대로 남는다', async () => {
      vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
      openPaymentWindow.mockRejectedValueOnce(new Error('닫음'));

      expect(await payOrder({ ...base, mode: 'window', method: 'CARD' })).toEqual({
        kind: 'windowFailed',
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    /**
     * 간편결제는 토스에서 제공사를 함께 지정해야 하는데 그 연동이 아직 없다.
     * 여기서 Mock 으로 새면 **결제창도 안 뜨는데 주문이 결제 완료가 된다** —
     * 가장 나쁜 종류의 불일치다. 화면이 이 수단을 감추지만 여기서도 막는다.
     */
    it('window 인데 간편결제면 창을 열지 않는다', async () => {
      vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await payOrder({ ...base, mode: 'window', method: 'EASY_PAY' });
      expect(openPaymentWindow).not.toHaveBeenCalled();
    });

    it('mock 이면 클라이언트 키가 있어도 창을 열지 않는다 — 방식은 서버가 정한다', async () => {
      vi.stubEnv('NEXT_PUBLIC_TOSS_CLIENT_KEY', KEY);
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));

      await payOrder({ ...base, mode: 'mock', method: 'CARD' });
      expect(openPaymentWindow).not.toHaveBeenCalled();
    });
  });

  /**
   * 열쇠 앞머리가 서버 쪽 Mock 게이트웨이의 갈래와 **짝**이다
   * (`lib/payments/mock.ts`). 한쪽만 고치면 조용히 어긋난다 — 가상계좌
   * 주문이 바로 결제완료가 되거나, 반대로 카드 주문이 입금대기로 남는다.
   */
  describe('결제창 없이 갈 때의 열쇠', () => {
    it('가상계좌는 mock_va_ 로 보낸다', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));
      await payOrder({ ...base, mode: 'mock', method: 'VIRTUAL_ACCOUNT' });
      expect(bodyOf().paymentKey).toBe('mock_va_20260910-7063897');
    });

    it.each(['CARD', 'TRANSFER', 'EASY_PAY'] as const)('%s 는 mock_ 로 보낸다', async (method) => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));
      await payOrder({ ...base, mode: 'mock', method });
      expect(bodyOf().paymentKey).toBe('mock_20260910-7063897');
    });

    it('금액은 주문에 박힌 값을 그대로 보낸다', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 200 }));
      await payOrder({ ...base, mode: 'mock', method: 'CARD' });
      expect(bodyOf().amount).toBe(71_000);
    });

    it('거절되면 서버가 준 말을 그대로 옮긴다', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ message: '카드사에서 거절했습니다' }), { status: 402 }),
      );
      expect(await payOrder({ ...base, mode: 'mock', method: 'CARD' })).toEqual({
        kind: 'confirmFailed',
        message: '카드사에서 거절했습니다',
      });
    });

    it('본문이 JSON 이 아니어도 무너지지 않는다', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('502 Bad Gateway', { status: 502 }));
      expect(await payOrder({ ...base, mode: 'mock', method: 'CARD' })).toEqual({
        kind: 'confirmFailed',
        message: null,
      });
    });
  });
});

/**
 * 결제창 이름은 부르는 곳이 둘이라(장바구니 줄 / 주문에 박힌 줄) 여기 모았다.
 * 두 곳에 따로 적으면 같은 주문이 결제창에서 다른 이름으로 보인다.
 */
describe('결제창에 뜨는 주문 이름', () => {
  const t = ((key: string, vars?: Record<string, unknown>) =>
    key === 'order.moreItems' ? `외 ${String(vars?.['count'])}건` : '주문') as never;

  it('한 건이면 상품명만', () => {
    expect(orderNameOf([{ productName: '울 코트' }], t)).toBe('울 코트');
  });

  it('여럿이면 첫 상품에 나머지 수를 붙인다', () => {
    expect(orderNameOf([{ productName: '울 코트' }, { productName: '니트' }], t)).toBe(
      '울 코트 외 1건',
    );
  });

  it('줄이 없으면 대신할 이름을 쓴다 — 결제창 제목이 비면 안 된다', () => {
    expect(orderNameOf([], t)).toBe('주문');
  });
});
