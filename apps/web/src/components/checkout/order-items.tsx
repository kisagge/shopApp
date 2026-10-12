'use client';

import Image from 'next/image';
import { Badge } from '@shop/ui';
import { isBlurDataUrl } from '@shop/core';
import type { CartQuoteResponse } from '@shop/contract';
import type { CartItem } from '~/stores/cart';
import { useT } from '~/lib/i18n/client';
import { CART_ISSUE_KEY } from '~/lib/i18n/cart-issue';

/**
 * 결제 직전에 무엇을 사는지 다시 보여 준다.
 *
 * 장바구니에서 담을 때 본 것과 **같은 사진**이라야 대조가 된다. 그래서
 * 견적이 준 이미지를 쓴다 — 장바구니가 들고 있는 값이 아니라.
 */
export function OrderItems({
  items,
  quote,
  money,
}: {
  items: readonly CartItem[];
  quote: CartQuoteResponse | undefined;
  money: (won: number) => string;
}) {
  const t = useT();

  return (
    <section aria-labelledby="items-title">
      <h2 id="items-title" className="mb-3.5 text-sm font-semibold">
        {t('checkout.items')} <span className="tnum text-[var(--fg-muted)]">{items.length}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((i) => {
          const line = quote?.lines.find((l) => l.variantId === i.variantId);
          return (
            <li key={i.variantId} className="flex items-center justify-between gap-3">
              {line?.imageUrl && (
                <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                  <Image
                    src={line.imageUrl}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="44px"
                    {...(isBlurDataUrl(line.blurDataUrl)
                      ? { placeholder: 'blur' as const, blurDataURL: line.blurDataUrl }
                      : {})}
                    className="object-cover"
                  />
                </span>
              )}
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{i.brand}</span>
                <span className="text-[13px]">{i.productName}</span>
                {/*
                  **줄였다고 적어 놓고 안 줄인 수를 보여 주고 있었다.**

                  이 수는 장바구니가 들고 있던 값(요청한 수)인데, 바로 옆의 금액은
                  견적이 셈한 값(재고에 맞춰 줄인 수)이다. 그래서 "재고가 부족해
                  수량을 줄였습니다" 라고 적힌 줄에 **3 과 2개분 금액**이 나란히
                  섰다 — 그 문장이 가리키는 바로 그 수만 안 고쳐져 있었다.

                  장바구니 화면은 같은 자리를 `(3→2)` 로 적는다(`cart-view`). 거기는
                  수량 단추가 요청한 수를 쥐고 있어 뱃지에 적었고, 여기는 단추가
                  없으니 수량 자리에 그대로 적는다.

                  견적이 오기 전에는 장바구니의 수가 우리가 가진 유일한 수다.
                */}
                <span className="text-[11px] text-[var(--fg-muted)]">
                  {i.optionLabel} ·{' '}
                  <span className="tnum">
                    {line?.issue === 'STOCK_REDUCED'
                      ? `${line.requestedQuantity}→${line.quantity}`
                      : (line?.quantity ?? i.quantity)}
                  </span>
                </span>
                {/*
                  줄마다 무엇이 잘못됐는지 그 자리에서 말한다. 위쪽에 한 줄로
                  모아 두면 어느 상품 이야기인지 알 수 없다.
                */}
                {line?.issue && (
                  <span role="status">
                    <Badge tone="danger">{t(CART_ISSUE_KEY[line.issue])}</Badge>
                  </span>
                )}
              </span>
              <span className="tnum text-sm font-semibold">
                {line ? money(line.subtotal) : '—'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
