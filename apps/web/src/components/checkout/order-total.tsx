'use client';

import { Price } from '@shop/ui';
import { won } from '@shop/core';
import type { CartQuoteResponse } from '@shop/contract';
import { useT } from '~/lib/i18n/client';

/**
 * 결제 금액.
 *
 * **줄마다 무엇이 빠졌는지 다 적는다.** 마지막 숫자 하나만 두면 왜 그 값이
 * 됐는지 알 수 없고, 그러면 사람은 결제 직전에 멈춘다.
 *
 * 금액은 견적이 준 값을 그대로 그린다 — 화면이 다시 셈하지 않는다. 여기서
 * 한 번 더 계산하면 서버와 어긋나는 날이 오고, 그때 어느 쪽이 맞는지
 * 사용자는 알 수 없다.
 */
export function OrderTotal({
  quote,
  pending,
  failed,
  money,
}: {
  quote: CartQuoteResponse | undefined;
  pending: boolean;
  /**
   * 견적을 못 받아 왔는가.
   *
   * **없으면 실패가 "계산 중" 으로 보인다.** 금액이 없는 까닭은 둘인데(아직 묻는 중,
   * 물었지만 못 받았다) 그리는 모습이 같으면 사람은 영원히 기다린다 — 그 사이 결제
   * 단추는 `aria-disabled` 로 잠겨 있고 왜 잠겼는지는 아무 데도 없다. 장바구니는
   * 이것을 이미 그리고 있었다(`cart-view` 의 `quote.isError`).
   */
  failed: boolean;
  money: (won: number) => string;
}) {
  const t = useT();

  return (
    <section aria-labelledby="total-title">
      <h2 id="total-title" className="mb-3.5 text-sm font-semibold">{t('checkout.total')}</h2>
      {failed ? (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {t('cart.quoteFailed')}
        </p>
      ) : pending || !quote ? (
        <p className="text-[13px] text-[var(--fg-muted)]">{t('cart.calculating')}</p>
      ) : (
        <dl className="flex flex-col gap-2.5">
          <Row label={t('cart.subtotal')} value={money(quote.listTotal)} />
          {quote.productDiscount > 0 && (
            <Row label={t('cart.productDiscount')} value={`-${money(quote.productDiscount)}`} accent />
          )}
          {quote.couponDiscount > 0 && (
            <Row label={t('cart.couponDiscount')} value={`-${money(quote.couponDiscount)}`} accent />
          )}
          {quote.pointsUsed > 0 && (
            <Row label={t('cart.pointsUsed')} value={`-${money(quote.pointsUsed)}`} accent />
          )}
          <Row
            label={t('cart.shippingFee')}
            value={quote.shippingFee === 0 ? t('cart.freeShipping') : money(quote.shippingFee)}
          />
          <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
            <dt className="text-[15px] font-semibold">{t('checkout.finalTotal')}</dt>
            <dd><Price amount={won(quote.payable)} size="md" /></dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );
}
