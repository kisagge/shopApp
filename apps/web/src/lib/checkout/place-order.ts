'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CreateOrderResponse, OrderError, PaymentMethodInput } from '@shop/contract';
import type { CartItem } from '~/stores/cart';
import { useCartStore } from '~/stores/cart';
import { track } from '~/lib/analytics/client';
import { getSessionId, getAnonymousId } from '~/lib/analytics/session';
import { openPaymentWindow, isUsableClientKey } from '~/lib/payments/client';
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
export function usePlaceOrder() {
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
     * 결제창.
     *
     * 클라이언트 키가 있으면 실제 토스 결제창을 띄운다. 창이 성공하면
     * 토스가 /checkout/success 로 **리다이렉트**하고 승인은 거기서 서버가
     * 한다 — 이 함수 뒤의 코드는 실행되지 않는다.
     *
     * 키가 없으면 Mock 으로 간다. 로컬에서 키 없이도 주문 흐름 전체를
     * 볼 수 있어야 한다. 서버 쪽 승인 흐름(금액 검증·멱등·상태 전이)은 같다.
     */
    const clientKey = process.env['NEXT_PUBLIC_TOSS_CLIENT_KEY'];
    if (isUsableClientKey(clientKey) && input.method !== 'EASY_PAY') {
      // 주문에 들어간 항목은 결제창을 열기 전에 장바구니에서 뺀다.
      // 창이 뜨면 이 페이지는 떠나므로 뒤에서 지울 기회가 없다.
      clear(input.items);
      try {
        await openPaymentWindow({
          clientKey,
          customerKey: getAnonymousId(),
          orderNo: order.orderNo,
          orderName: orderName(input.items, t),
          amount: order.payable,
          method: input.method,
          origin: window.location.origin,
        });
      } catch {
        // 창을 닫거나 SDK 를 못 불러왔다. 주문은 이미 만들어져 있으므로
        // 주문 화면에서 다시 시도할 수 있다.
        router.push(`/order/${order.orderNo}?payment=failed`);
      }
      return { refetchQuote: false };
    }

    setPending(true);
    const mockKey = `${input.method === 'VIRTUAL_ACCOUNT' ? 'mock_va' : 'mock'}_${order.orderNo}`;
    const confirmRes = await fetch(`/api/orders/${order.orderNo}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentKey: mockKey, amount: order.payable }),
    });
    setPending(false);

    clear(input.items);

    if (!confirmRes.ok) {
      // 주문은 만들어졌지만 결제가 실패했다. 주문 화면에서 다시 시도할 수 있다.
      const body = (await confirmRes.json()) as { message?: string };
      setError(`${body.message ?? t('checkout.approveFailed')} ${t('checkout.retryFromOrders')}`);
    }

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

/** 결제창 제목. 여럿이면 첫 상품에 "외 n건" 을 붙인다. */
function orderName(items: readonly CartItem[], t: ReturnType<typeof useT>): string {
  const first = items[0]?.productName ?? t('checkout.orderFallbackName');
  if (items.length === 1) return first;
  return `${first} ${t('order.moreItems', { count: items.length - 1 })}`;
}
