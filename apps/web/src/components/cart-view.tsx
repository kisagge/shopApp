'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Badge, Button, Price } from '@shop/ui';
import { won } from '@shop/core';
import type { CartQuoteLine } from '@shop/contract';
import { formatMoney, formatNumber } from '@shop/i18n';
import { track } from '~/lib/analytics/client';
import { useCartQuote } from '~/lib/use-cart-quote';
import { useCartStore, type CartItem } from '~/stores/cart';
import { useLocale, useT } from '~/lib/i18n/client';
import { CART_ISSUE_KEY } from '~/lib/i18n/cart-issue';

export function CartView() {
  const t = useT();
  const items = useCartStore((s) => s.items);
  const { toggleSelected, setAllSelected, removeSelected, remove, increment, decrement } =
    useCartStore.getState();

  /**
   * 파생값은 셀렉터가 아니라 여기서 만든다.
   *
   * useCartStore((s) => s.items.filter(...)) 처럼 쓰면 셀렉터가 렌더마다 **새 배열**을
   * 돌려주고, 스토어는 스냅샷이 계속 바뀐다고 판단해 무한 렌더에 빠진다.
   * (React 가 "getServerSnapshot should be cached" 로 경고하는 그 상황이다.)
   * 스토어에서는 참조가 안정된 items 만 구독하고 나머지는 useMemo 로 만든다.
   */
  const selected = useMemo(() => items.filter((i) => i.selected), [items]);
  const allSelected = items.length > 0 && selected.length === items.length;

  const quote = useCartQuote({ items: selected });

  useEffect(() => {
    track('view_cart', { itemCount: items.length });
    // 장바구니 진입은 한 번만 기록한다. 수량을 바꿀 때마다 찍으면 노이즈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byVariant = useMemo(() => {
    const map = new Map<string, CartQuoteLine>();
    for (const l of quote.data?.lines ?? []) map.set(l.variantId, l);
    return map;
  }, [quote.data]);

  if (items.length === 0) return <EmptyCart />;

  const buyableCount = (quote.data?.lines ?? []).filter((l) => l.quantity > 0).length;

  return (
    <div className="pb-32">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3.5 md:px-0">
        <button
          type="button"
          role="checkbox"
          aria-checked={allSelected}
          onClick={() => setAllSelected(!allSelected)}
          className="flex min-h-11 items-center gap-2.5"
        >
          <Check on={allSelected} />
          <span className="text-[13px]">
            {t('cart.selectAll')}{' '}
            <span className="tnum">
              ({selected.length}/{items.length})
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => removeSelected()}
          className="py-1.5 text-xs text-[var(--fg-muted)]"
        >
          {t('cart.deleteSelected')}
        </button>
      </div>

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.variantId} className="border-b border-[var(--border)] px-4 py-5 md:px-0">
            <CartRow
              item={item}
              line={byVariant.get(item.variantId)}
              loading={quote.isPending && item.selected}
              onToggle={() => toggleSelected(item.variantId)}
              onRemove={() => {
                remove(item.variantId);
                track('remove_from_cart', {
                  productId: item.productId,
                  variantId: item.variantId,
                  quantity: item.quantity,
                });
              }}
              onIncrement={() => increment(item.variantId)}
              onDecrement={() => decrement(item.variantId)}
            />
          </li>
        ))}
      </ul>

      <Summary quote={quote} selectedCount={selected.length} />

      <div className="safe-b fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--bg)] px-4 pt-2.5 pb-5 md:static md:mt-8 md:border-0 md:px-0 md:pb-0">
        <div className="mx-auto max-w-[720px]">
          <Button
            block
            aria-disabled={buyableCount === 0}
            onClick={() => {
              if (buyableCount === 0) return;
              track('begin_checkout', { itemCount: buyableCount });
              // 대입이 아니라 호출로 옮긴다 — 동작은 같고, 바깥 값을 고치지
              // 말라는 규칙에 걸리지 않는다
              window.location.assign('/checkout');
            }}
          >
            {buyableCount === 0
              ? t('cart.nothingBuyable')
              : t('cart.checkoutCount', { count: buyableCount })}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-[11px] font-semibold',
        on ? 'bg-n-900 text-n-0' : 'border border-n-300',
      ].join(' ')}
    >
      {on ? '✓' : ''}
    </span>
  );
}

function CartRow({
  item, line, loading, onToggle, onRemove, onIncrement, onDecrement,
}: {
  item: CartItem;
  line: CartQuoteLine | undefined;
  loading: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const unavailable = line !== undefined && line.quantity === 0;

  return (
    <article className="flex gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.selected}
        aria-label={t('cart.selectItem', { name: item.productName })}
        onClick={onToggle}
        className="mt-0.5 shrink-0"
      >
        <Check on={item.selected} />
      </button>

      <div
        role="img"
        aria-label={t('cart.itemImage', { name: item.productName })}
        className="flex h-[95px] w-[76px] shrink-0 items-center justify-center rounded-sm bg-ph-sand text-[10px] tracking-widest text-n-500"
      >
        IMG
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
              {item.brand}
            </p>
            <h3 className={unavailable ? 'text-[13px] text-[var(--fg-muted)]' : 'text-[13px]'}>
              <Link href={`/product/${line?.productSlug ?? ''}`} className="text-inherit no-underline">
                {item.productName}
              </Link>
            </h3>
          </div>
          <button
            type="button"
            aria-label={t('cart.removeItem', { name: item.productName })}
            onClick={onRemove}
            className="-mt-1 -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--fg-muted)]"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-[var(--fg-muted)]">{item.optionLabel}</p>

        {/* 문제는 색이 아니라 문장으로 알린다 */}
        {line?.issue && (
          <p role="status" className="w-fit">
            <Badge tone={line.quantity === 0 ? 'danger' : 'neutral'}>
              {t(CART_ISSUE_KEY[line.issue])}
              {line.issue === 'STOCK_REDUCED' && (
                <span className="tnum ml-1">({line.requestedQuantity}→{line.quantity})</span>
              )}
            </Badge>
          </p>
        )}

        <div className="flex items-end justify-between gap-2 pt-0.5">
          <div className="flex items-center rounded-sm border border-[var(--border)]">
            <button
              type="button" aria-label={t('cart.decrease')} onClick={onDecrement}
              className="flex h-8 w-8 items-center justify-center text-[var(--fg-secondary)]"
            >
              −
            </button>
            <span aria-label={t('cart.quantityOf', { count: item.quantity })} className="tnum w-7 text-center text-[13px] font-semibold">
              {item.quantity}
            </span>
            <button
              type="button" aria-label={t('cart.increase')} onClick={onIncrement}
              className="flex h-8 w-8 items-center justify-center"
            >
              ＋
            </button>
          </div>

          {loading ? (
            <span className="text-xs text-[var(--fg-muted)]">{t('cart.calculating')}</span>
          ) : line && line.quantity > 0 ? (
            <p className="flex flex-col items-end gap-0.5">
              {line.discountPercent > 0 && (
                <span className="tnum text-[11px] text-[var(--fg-muted)] line-through">
                  {formatMoney(locale, line.listPrice * line.quantity)}
                </span>
              )}
              <span className="tnum text-[15px] font-semibold">
                {formatMoney(locale, line.subtotal)}
              </span>
            </p>
          ) : (
            <span className="text-xs text-[var(--fg-muted)]">
              {item.selected ? '—' : t('cart.selectToCalculate')}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

function Summary({
  quote, selectedCount,
}: {
  quote: ReturnType<typeof useCartQuote>;
  selectedCount: number;
}) {
  const t = useT();
  const locale = useLocale();
  const money = (amount: number) => formatMoney(locale, amount);

  if (selectedCount === 0) {
    return (
      <p className="px-4 py-10 text-center text-[13px] text-[var(--fg-muted)] md:px-0">
        {t('cart.selectSomething')}
      </p>
    );
  }
  if (quote.isError) {
    return (
      <p role="alert" className="mx-4 my-6 rounded-sm bg-accent-soft px-4 py-3 text-[13px] text-accent-hover md:mx-0">
        {t('cart.quoteFailed')}
      </p>
    );
  }

  const q = quote.data;
  const row = (label: string, value: string, tone?: 'accent') => (
    <div key={label} className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${tone === 'accent' ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );

  return (
    <section aria-labelledby="cart-summary" className="mt-3 px-4 py-6 md:px-0">
      <h2 id="cart-summary" className="mb-3.5 text-sm font-semibold">
        {t('cart.summary')}
      </h2>
      {quote.isPending || !q ? (
        <p className="text-[13px] text-[var(--fg-muted)]">{t('cart.calculating')}</p>
      ) : (
        <>
          <dl className="flex flex-col gap-2.5">
            {row(t('cart.subtotal'), money(q.listTotal))}
            {q.productDiscount > 0 &&
              row(t('cart.productDiscount'), `-${money(q.productDiscount)}`, 'accent')}
            {q.couponDiscount > 0 &&
              row(
                q.couponName
                  ? t('cart.couponDiscountNamed', { name: q.couponName })
                  : t('cart.couponDiscount'),
                `-${money(q.couponDiscount)}`,
                'accent',
              )}
            {q.pointsUsed > 0 && row(t('cart.pointsUsed'), `-${money(q.pointsUsed)}`, 'accent')}
            {row(
              t('cart.shippingFee'),
              q.shippingFee === 0 ? t('cart.freeShipping') : money(q.shippingFee),
            )}
            <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
              <dt className="text-[15px] font-semibold">{t('cart.payable')}</dt>
              <dd>
                <Price amount={won(q.payable)} size="md" locale={locale} />
              </dd>
            </div>
          </dl>

          {!q.isFreeShipping && q.remainingForFreeShipping > 0 && (
            <p className="mt-3 rounded-sm bg-info-soft px-3 py-2.5 text-xs text-info">
              <span className="tnum font-semibold">
                {money(q.remainingForFreeShipping)}
              </span>{' '}
              {t('cart.freeShippingLeft')}
            </p>
          )}
          <p className="mt-2.5 text-right text-[11px] text-[var(--fg-muted)]">
            {t('cart.rewardPreview', { amount: formatNumber(locale, q.rewardPoints) })}
          </p>
        </>
      )}
    </section>
  );
}

function EmptyCart() {
  const t = useT();

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-24">
      <p className="text-[15px] text-[var(--fg-muted)]">{t('cart.empty')}</p>
      <Link
        href="/"
        className="inline-flex h-12 items-center rounded-sm bg-n-900 px-7 text-sm font-medium text-n-0 no-underline"
      >
        {t('cart.goShopping')}
      </Link>
    </div>
  );
}
