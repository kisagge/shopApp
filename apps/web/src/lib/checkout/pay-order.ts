import type { PaymentMethodInput } from '@shop/contract';
import type { Translator } from '@shop/i18n';
import type { PaymentMode } from '@shop/core';
import { openPaymentWindow } from '~/lib/payments/client';
import { getAnonymousId } from '~/lib/analytics/session';

/**
 * **이미 만들어진 주문에 결제를 건다.**
 *
 * 주문 만들기(`place-order.ts`)와 다시 걸기(`repay-button.tsx`)가 **같은 이
 * 함수를 쓴다.** 두 군데에 따로 적으면 갈린다 — 결제 방식을 브라우저와 서버가
 * 따로 정하다 갈려서 승인이 500 이 났던 것이 바로 그 모양이었다. 특히
 * Mock 열쇠 규칙(`mock_va_` 와 `mock_`)은 서버의 판정과 짝이라, 한쪽만
 * 고치면 조용히 어긋난다.
 */

export type PayResult =
  /** 결제창이 열렸다. 브라우저는 곧 토스로 떠난다 — 뒤의 코드는 돌지 않는다 */
  | { kind: 'window' }
  /** 결제창을 열다 실패했다(창을 닫았거나 SDK 를 못 불러왔다) */
  | { kind: 'windowFailed' }
  /** 결제창 없이 승인까지 마쳤다 */
  | { kind: 'confirmed' }
  /** 승인이 거절됐다. 주문은 그대로 남는다 */
  | { kind: 'confirmFailed'; message: string | null };

export interface PayOrderInput {
  readonly mode: PaymentMode;
  readonly orderNo: string;
  readonly payable: number;
  readonly method: PaymentMethodInput;
  /** 결제창 제목 */
  readonly orderName: string;
}

export async function payOrder(input: PayOrderInput): Promise<PayResult> {
  const clientKey = process.env['NEXT_PUBLIC_TOSS_CLIENT_KEY'];

  /*
   * 간편결제는 토스 결제창에서 제공사를 함께 지정해야 하는데 그 연동이 아직
   * 없다. 실제 키가 있는 환경에서 이것만 Mock 으로 빠지면 **결제창도 안 뜨는데
   * 주문이 결제 완료가 된다.** 그래서 화면이 이 수단을 아예 감춘다.
   */
  if (input.mode === 'window' && clientKey && input.method !== 'EASY_PAY') {
    try {
      await openPaymentWindow({
        clientKey,
        customerKey: getAnonymousId(),
        orderNo: input.orderNo,
        orderName: input.orderName,
        amount: input.payable,
        method: input.method,
        origin: window.location.origin,
      });
    } catch {
      return { kind: 'windowFailed' };
    }
    return { kind: 'window' };
  }

  /*
   * 결제창 없이 가는 길. 열쇠 앞머리가 서버 쪽 Mock 게이트웨이의 갈래와
   * 짝이다(`lib/payments/mock.ts`) — 가상계좌는 입금 대기로, 나머지는
   * 바로 승인으로 답한다.
   */
  const mockKey = `${input.method === 'VIRTUAL_ACCOUNT' ? 'mock_va' : 'mock'}_${input.orderNo}`;
  const res = await fetch(`/api/orders/${input.orderNo}/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ paymentKey: mockKey, amount: input.payable }),
  });

  if (res.ok) return { kind: 'confirmed' };

  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return { kind: 'confirmFailed', message: body.message ?? null };
}

/**
 * 결제창에 뜨는 주문 이름.
 *
 * **여기 두는 이유는 부르는 곳이 둘이기 때문이다** — 주문을 만들 때는
 * 장바구니 줄에서, 다시 결제할 때는 주문에 박힌 줄에서 만든다. 두 곳에 따로
 * 적으면 같은 주문이 결제창에서 다른 이름으로 보인다.
 *
 * 상품명만 있으면 되므로 받는 모양을 그만큼만 요구한다.
 */
export function orderNameOf(items: readonly { productName: string }[], t: Translator): string {
  const first = items[0]?.productName ?? t('checkout.orderFallbackName');
  // `=== 1` 이 아니라 `<= 1` 이다 — 빈 줄이면 "외 -1건" 이 붙었다
  if (items.length <= 1) return first;
  return `${first} ${t('order.moreItems', { count: items.length - 1 })}`;
}
