'use client';

import { useQuery } from '@tanstack/react-query';
import type { CartQuoteResponse } from '@shop/contract';
import type { CartItem } from '~/stores/cart';

export interface QuoteInput {
  readonly items: readonly CartItem[];
  readonly couponCode?: string;
  /** 쿠폰을 쓰지 않겠다고 고른 경우에만 false. 안 보내면 서버가 가장 나은 것을 붙인다. */
  readonly useCoupon?: boolean;
  readonly pointsToUse?: number;
  readonly isRemoteArea?: boolean;
}

/**
 * 금액을 서버에 물어본다.
 *
 * 화면이 직접 곱하고 더하면 서버가 계산한 결제 금액과 어긋나고, 그 차이는
 * 결제 직전에야 드러난다. 장바구니에 보이는 숫자와 결제될 숫자는 같은
 * 계산에서 나와야 한다.
 */
export function useCartQuote(input: QuoteInput) {
  const lines = input.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));

  return useQuery<CartQuoteResponse>({
    queryKey: [
      'cart-quote', lines, input.couponCode, input.useCoupon, input.pointsToUse, input.isRemoteArea,
    ],
    enabled: lines.length > 0,
    queryFn: async () => {
      const res = await fetch('/api/cart/quote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lines,
          ...(input.couponCode ? { couponCode: input.couponCode } : {}),
          ...(input.useCoupon === false ? { useCoupon: false } : {}),
          ...(input.pointsToUse ? { pointsToUse: input.pointsToUse } : {}),
          isRemoteArea: input.isRemoteArea ?? false,
        }),
      });
      if (!res.ok) throw new Error('견적을 불러오지 못했습니다');
      return res.json() as Promise<CartQuoteResponse>;
    },
  });
}
