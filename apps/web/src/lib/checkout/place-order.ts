'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateOrderResponse, OrderError, PaymentMethodInput } from '@shop/contract';
import type { PaymentMode } from '@shop/core';
import { payOrder, orderNameOf } from './pay-order';
import type { CartItem } from '~/stores/cart';
import { useCartStore } from '~/stores/cart';
import { track } from '~/lib/analytics/client';
import { getSessionId } from '~/lib/analytics/session';
import { useT } from '~/lib/i18n/client';

/**
 * 결제 시도 하나를 가리키는 열쇠.
 *
 * randomUUID 는 보안 컨텍스트에서만 있다. 개발 중 http 로 열어 두면 없어서
 * 여기서 통째로 터지는데, **그러면 주문 화면 자체가 안 열린다** — 중복을
 * 막으려다 주문을 못 하게 만드는 셈이다. 없으면 난수로 물러난다.
 */
function newOrderKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface PlaceOrderInput {
  readonly items: readonly CartItem[];
  readonly addressId: string;
  /** 고른 쿠폰 코드. 안 쓰면 넣지 않는다. */
  readonly couponCode?: string | undefined;
  readonly memo: string;
  readonly pointsToUse: number;
  readonly method: PaymentMethodInput;
  readonly payable: number;
}

/**
 * 주문 만들기부터 결제 승인까지.
 *
 * **화면에서 떼어 낸 이유가 있다.** 이 흐름은 요청이 둘이고 그 사이에
 * 브라우저가 다른 곳으로 떠날 수 있다 — 결제창이 뜨면 이 뒤의 코드는
 * 아예 실행되지 않는다. 그런 갈래를 250줄짜리 JSX 사이에 끼워 두면 읽는
 * 사람이 어디서 끝나는지 알 수 없다. 돈이 걸린 자리라 더 그렇다.
 *
 * 열쇠는 **훅이 사는 동안 같은 값**이다. 그래야 두 번 눌렀거나 응답을 못
 * 받아 다시 보냈을 때 서버가 같은 시도인 줄 알아본다. 매번 새로 만들면
 * 열쇠가 있어도 없는 것과 같다.
 */
export function usePlaceOrder(mode: PaymentMode) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [orderKey] = useState(newOrderKey);

  /** 만든 주문에 들어간 것만 장바구니에서 뺀다 */
  const clear = (items: readonly CartItem[]) => {
    for (const i of items) useCartStore.getState().remove(i.variantId);
  };

  /**
   * 돌려주는 값은 **다시 견적을 받아야 하는가**다.
   *
   * 재고가 모자라 실패한 경우에만 금액이 달라지므로, 그 판단을 여기서 하고
   * 화면은 시키는 대로 한 번 더 받아 온다 — 훅이 견적까지 들고 있으면
   * 화면과 훅이 같은 것을 두 벌로 갖게 된다.
   */
  async function place(input: PlaceOrderInput): Promise<{ refetchQuote: boolean }> {
    setError(null);
    setPending(true);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        addressId: input.addressId,
        ...(input.memo.trim() ? { deliveryMemo: input.memo.trim() } : {}),
        /*
         * **견적에 붙인 쿠폰은 주문에도 붙어야 한다.** 화면에서는 깎인 금액이
         * 보이는데 주문이 제값으로 만들어지면, 사람은 결제창에서야 다른 숫자를
         * 본다. 서버가 다시 검증하므로 여기서 보내는 것은 "무엇을 골랐는가" 다.
         */
        ...(input.couponCode ? { couponCode: input.couponCode } : {}),
        ...(input.pointsToUse > 0 ? { pointsToUse: input.pointsToUse } : {}),
        paymentMethod: input.method,
        // 퍼널을 이어 붙이려면 조회·담기와 같은 세션이어야 한다
        browserSessionId: getSessionId(),
        // 같은 시도를 두 번 보내도 주문은 하나다
        idempotencyKey: orderKey,
        agreedToTerms: true,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = (await res.json()) as Partial<OrderError> & { message?: string };
      setError(body.message ?? t('checkout.orderFailed'));
      return { refetchQuote: body.code === 'OUT_OF_STOCK' };
    }

    const order = (await res.json()) as CreateOrderResponse;
    track('add_payment_info', { method: input.method });

    /**
     * 결제.
     *
     * `mode` 는 **서버가 정해서 내려 준 결론**이다(`serverPaymentMode`).
     * 예전에는 여기서 클라이언트 키를 직접 보고 정했는데, 서버는 시크릿 키를
     * 보고 정하고 있었다. 배포에 두 키가 다 없자 브라우저는 "Mock 으로 간다",
     * 서버는 "프로덕션에서 Mock 은 못 쓴다" 로 갈렸다 — **주문은 만들어지고
     * 확정만 500** 이 났다. 그래서 판단을 브라우저에서 걷어냈다.
     *
     * **결제를 거는 방법은 `payOrder` 한 군데에만 있다.** 결제 대기 주문에
     * 다시 걸 때(`repay-button.tsx`)와 같은 함수를 쓴다 — 여기와 거기에
     * 따로 적으면 Mock 열쇠 규칙이 조용히 어긋난다.
     *
     * 결제창이 열리면 브라우저는 토스로 떠나고, 승인은 돌아온 뒤
     * /checkout/success 에서 서버가 한다 — 이 함수 뒤는 실행되지 않는다.
     */
    setPending(true);
    const paid = await payOrder({
      mode,
      orderNo: order.orderNo,
      payable: order.payable,
      method: input.method,
      orderName: orderNameOf(input.items, t),
      // 창이 뜨면 이 페이지를 떠나므로 그때는 먼저 비워야 한다
      beforeWindow: () => clear(input.items),
    });

    if (paid.kind === 'window') return { refetchQuote: false };

    /*
     * **주문이 만들어졌으면 비운다 — 승인 성공 여부와 무관하다.**
     * 승인만 실패한 것은 주문이 없는 것이 아니다. 남겨 두면 같은 것을 다시
     * 담아 두 번 주문하게 되고, 두 주문이 재고를 각각 물게 된다.
     *
     * **비우는 시점만 뒤로 옮겼다.** 결제 앞에 두면 결제가 도는 1.5초 동안
     * 이 화면이 "주문할 상품이 없습니다" 로 바뀐다 — 기기에서 그렇게 보였다.
     * 창을 여는 길만 예외다(`beforeWindow`). 그때는 페이지를 떠나 버린다.
     */
    clear(input.items);

    if (paid.kind === 'windowFailed') {
      // 창을 닫거나 SDK 를 못 불러왔다. 주문은 이미 만들어져 있다.
      setPending(false);
      router.push(`/order/${order.orderNo}?payment=failed`);
      return { refetchQuote: false };
    }

    if (paid.kind === 'confirmFailed') {
      // 주문은 만들어졌지만 결제가 실패했다. 주문 화면에서 다시 걸 수 있다.
      setPending(false);
      setError(`${paid.message ?? t('checkout.approveFailed')} ${t('checkout.retryFromOrders')}`);
      router.push(`/order/${order.orderNo}?payment=failed`);
      return { refetchQuote: false };
    }

    /*
     * `pending` 은 그대로 둔다. 여기서 풀면 주소가 바뀌기까지 남은 0.6~1초
     * 동안 결제 버튼이 다시 눌리는 모습으로 돌아간다 — 아무 일도 안 일어난
     * 것처럼 보인다. 이 화면은 곧 사라지므로 잠긴 채로 두는 것이 맞다.
     */

    router.push(`/order/${order.orderNo}`);
    return { refetchQuote: false };
  }

  /*
   * setError 를 내보내지 않는다. 이 흐름 밖에서 오류를 세울 일이 없고,
   * 열어 두면 화면이 훅이 모르는 문구를 끼워 넣게 된다 — 그러면 지금
   * 무슨 일이 일어났는지 두 곳을 봐야 알 수 있다.
   */
  return { place, pending, error };
}

