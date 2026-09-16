'use client';

import { useEffect, useMemo, useState } from 'react';
import { TrackedLink as Link } from '~/components/tracked-link';
import Image from 'next/image';
import { Badge, Button, Price } from '@shop/ui';
import { won, isBlurDataUrl } from '@shop/core';
import type { CartQuoteLine } from '@shop/contract';
import { formatMoney, formatNumber } from '@shop/i18n';
import { track } from '~/lib/analytics/client';
import { useCartQuote } from '~/lib/use-cart-quote';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { useCartStore, type CartItem } from '~/stores/cart';
import { useLocale, useT } from '~/lib/i18n/client';
import { CART_ISSUE_KEY } from '~/lib/i18n/cart-issue';
import { CartOptionChange } from '~/components/cart-option-change';

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

  /*
   * 줄을 지우면 그 줄의 ✕ 버튼도 함께 사라진다. 챙기지 않으면 초점이 body 로
   * 떨어져, 세 줄을 지우려면 탭으로 문서 맨 앞부터 세 번 내려와야 한다.
   */
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(items.length);
  // 옵션을 바꾼 결과. 바꾼 줄은 새로 그려지므로 알림은 줄 바깥에 둔다
  const [announcement, setAnnouncement] = useState('');

  if (items.length === 0) return <EmptyCart headingRef={emptyRef} />;

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

      <p role="status" className="sr-only">{announcement}</p>

      <ul ref={listRef as React.RefObject<HTMLUListElement>} className="flex flex-col">
        {items.map((item, index) => (
          <li key={item.variantId} className="border-b border-[var(--border)] px-4 py-5 md:px-0">
            <CartRow
              item={item}
              line={byVariant.get(item.variantId)}
              loading={quote.isPending && item.selected}
              onToggle={() => toggleSelected(item.variantId)}
              onRemove={() => {
                // 어느 자리였는지 먼저 기억한다. 지운 뒤에는 알 방법이 없다.
                rememberRemoval(index);
                remove(item.variantId);
                track('remove_from_cart', {
                  productId: item.productId,
                  variantId: item.variantId,
                  quantity: item.quantity,
                });
              }}
              onIncrement={() => increment(item.variantId)}
              onDecrement={() => decrement(item.variantId)}
              onOptionChanged={setAnnouncement}
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
        on ? 'bg-[var(--brand)] text-[var(--bg)]' : 'border border-[var(--border-strong)]',
      ].join(' ')}
    >
      {on ? '✓' : ''}
    </span>
  );
}

function CartRow({
  item, line, loading, onToggle, onRemove, onIncrement, onDecrement, onOptionChanged,
}: {
  item: CartItem;
  line: CartQuoteLine | undefined;
  loading: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onOptionChanged: (message: string) => void;
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

      {/*
        담은 것이 무엇인지 눈으로 확인할 수 있어야 한다. 옵션이 비슷한 상품을 여럿 담으면 사진
        말고는 구별할 방법이 없다.

        **사진은 견적이 먼저, 없으면 담을 때 적어 둔 것.** 예전에는 견적만 봐서, 견적이 오기
        전까지 "IMG" 라고 적힌 칸이 먼저 떴다. 담을 때 본 사진과 흐린 미리보기를 스토어가 들고
        있으니 열자마자 흐린 사진이 뜨고 선명해진다.

        그래도 모르면: 견적을 기다리는 중이면 글자 없는 빈 자리, 사진이 정말 없는 상품이면 톤
        블록이다. 둘 다 "IMG" 같은 글자는 넣지 않는다 — 읽는 사람에게 뜻이 없다.
      */}
      {(() => {
        const imageUrl = line?.imageUrl ?? item.imageUrl ?? null;
        const blur = line ? line.blurDataUrl : (item.blurDataUrl ?? null);
        const label = line?.imageAlt ?? t('cart.itemImage', { name: item.productName });
        if (imageUrl) {
          return (
            <div className="relative h-[95px] w-[76px] shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
              <Image
                src={imageUrl}
                alt={label}
                fill
                // 크기가 고정이라 기기 크기 목록 전체로 후보를 만들 이유가 없다
                sizes="76px"
                {...(isBlurDataUrl(blur) ? { placeholder: 'blur' as const, blurDataURL: blur } : {})}
                className="object-cover"
              />
            </div>
          );
        }
        return (
          <div
            role="img"
            aria-label={label}
            {...(loading && !line ? { 'aria-busy': true } : {})}
            className={`h-[95px] w-[76px] shrink-0 rounded-sm ${
              loading && !line ? 'bg-[var(--surface-2)] motion-safe:animate-pulse' : 'bg-ph-sand'
            }`}
          />
        );
      })()}

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
            // 지운 뒤 옆 줄을 찾는 표시. 클래스 이름에 기대면 스타일을 바꿀 때 끊긴다.
            data-remove-row=""
            onClick={onRemove}
            className="-mt-1 -mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center text-[var(--fg-muted)]"
          >
            ✕
          </button>
        </div>

        <p className="text-[11px] text-[var(--fg-muted)]">{item.optionLabel}</p>

        {/*
          **품절 줄에서 할 수 있는 일이 지우기뿐이었다.** 같은 상품의 다른 옵션으로 바꾸는
          길을 줄 안에 둔다. 살 수 없는 줄이면 눈에 띄게 — 그게 이 줄의 다음 할 일이다.
        */}
        <CartOptionChange
          item={item}
          prominent={line !== undefined && (line.issue === 'SOLD_OUT' || line.issue === 'INACTIVE')}
          onChanged={onOptionChanged}
        />

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
            {/*
              **장바구니에도 쿠폰이 붙는다.** 견적에 코드를 보내지 않으면 서버가
              가장 많이 깎이는 것을 붙이므로, 여기 보이는 값이 곧 지금 사면 낼
              값이다. 어느 쿠폰인지 이름을 함께 적는다 — 이름 없이 금액만
              줄어들면 사람은 왜 싸졌는지 모른 채 결제로 넘어간다.
              바꾸는 것은 주문서에서 한다. 장바구니는 담는 자리지 고르는
              자리가 아니다.
            */}
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

function EmptyCart({ headingRef }: { headingRef?: React.RefObject<HTMLElement | null> }) {
  const t = useT();

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-24">
      {/*
        마지막 줄을 지우면 목록이 통째로 이 화면으로 바뀐다. 초점이 갈 곳이
        없으면 body 로 떨어지고, 낭독기는 장바구니가 비었다는 말을 하지 않는다.
        tabIndex -1 이라 평소 탭 순서에는 걸리지 않는다.
      */}
      <p
        ref={headingRef as React.RefObject<HTMLParagraphElement>}
        tabIndex={-1}
        role="status"
        className="text-[15px] text-[var(--fg-muted)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--fg)]"
      >
        {t('cart.empty')}
      </p>
      <Link
        href="/"
        className="inline-flex h-12 items-center rounded-sm bg-[var(--brand)] px-7 text-sm font-medium text-[var(--bg)] no-underline"
      >
        {t('cart.goShopping')}
      </Link>
    </div>
  );
}
