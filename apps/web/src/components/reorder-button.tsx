'use client';

import { useState } from 'react';
import { Button } from '@shop/ui';
import type { MessageKey } from '@shop/i18n';
import type { ReorderSkip } from '@shop/core';
import type { ReorderResponse } from '@shop/contract';
import { TrackedLink as Link } from '~/components/tracked-link';
import { track } from '~/lib/analytics/client';
import { failureMessage } from '~/lib/client/failure-message';
import { useCartStore } from '~/stores/cart';
import { useT } from '~/lib/i18n/client';

/** 못 담은 까닭마다의 문구. 까닭을 하나 더하면 여기서 컴파일이 멈춘다 */
const SKIP_KEY = {
  CANCELED: 'reorder.skip.CANCELED',
  UNAVAILABLE: 'reorder.skip.UNAVAILABLE',
  SOLD_OUT: 'reorder.skip.SOLD_OUT',
  CART_FULL: 'reorder.skip.CART_FULL',
} as const satisfies Record<ReorderSkip, MessageKey>;

/**
 * 지난 주문 **다시 담기.**
 *
 * 다시 사는 길이 어디에도 없었다 — 같은 양말을 철마다 사는 사람도 상품을 하나씩 찾아
 * 옵션을 다시 골라야 했다.
 *
 * **담은 뒤에 결과를 말한다.** 몇 개를 담았는지, 무엇을 줄였고 무엇을 못 담았는지.
 * 조용히 장바구니로 보내면 열 개 중 두 개가 빠진 것을 결제 화면에서야 안다. 그래서
 * 장바구니로 곧장 옮기지 않고 여기서 말한 뒤 가는 길을 준다.
 */
export function ReorderButton({ orderNo }: { orderNo: string }) {
  const t = useT();
  const add = useCartStore((s) => s.add);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ReorderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reorder() {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/reorder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 줄 수 상한을 서버가 따지려면 지금 무엇이 담겨 있는지만 알면 된다
        body: JSON.stringify({
          cartVariantIds: useCartStore.getState().items.map((i) => i.variantId),
        }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, t('reorder.failed')));
        return;
      }
      const plan = (await response.json()) as ReorderResponse;
      for (const line of plan.add) {
        add({
          variantId: line.variantId,
          productId: line.productId,
          productName: line.productName,
          brand: line.brand,
          optionLabel: line.optionLabel,
          listPrice: line.listPrice,
          // 표시용이다. 결제 금액은 견적이 다시 정한다
          salePrice: line.salePrice,
          imageUrl: line.imageUrl,
          blurDataUrl: line.blurDataUrl,
        }, line.quantity);
        // 다시 담기도 담기다 — 퍼널에서 빠지면 재구매가 많은 달의 전환이 낮게 보인다
        track('add_to_cart', { productId: line.productId, variantId: line.variantId, quantity: line.quantity });
      }
      setResult(plan);
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  const reduced = result?.add.filter((l) => l.reduced) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" disabled={pending} onClick={() => void reorder()}>
        {pending ? t('reorder.pending') : t('reorder.button')}
      </Button>

      {error && (
        <p role="alert" className="text-[13px] text-accent">{error}</p>
      )}

      {/* 결과는 한 덩어리로 읽힌다 — 몇 개 담았는지가 먼저, 빠진 것이 그 뒤 */}
      <div role="status" className="flex flex-col gap-2">
        {result && (
          <>
            <p className="text-[13px] font-medium">
              {result.add.length > 0
                ? t('reorder.added', { count: result.add.length })
                : t('reorder.none')}
            </p>
            {(reduced.length > 0 || result.skipped.length > 0) && (
              <ul className="flex flex-col gap-1 text-[12px] text-[var(--fg-secondary)]">
                {reduced.map((l) => (
                  <li key={`r-${l.variantId}`}>
                    {t('reorder.reduced', { name: l.productName, option: l.optionLabel, count: l.quantity })}
                  </li>
                ))}
                {result.skipped.map((s, i) => (
                  <li key={`s-${i}`}>
                    {t(SKIP_KEY[s.reason], { name: s.productName, option: s.optionLabel })}
                  </li>
                ))}
              </ul>
            )}
            {result.add.length > 0 && (
              <Link href="/cart" className="w-fit text-[13px] underline">{t('reorder.goCart')}</Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
