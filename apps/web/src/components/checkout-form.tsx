'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Badge, Button, Field, Price } from '@shop/ui';
import { won, MIN_POINTS_USE, isBlurDataUrl } from '@shop/core';
import {
  PAYMENT_METHOD,
  type CreateOrderResponse, type OrderError, type PaymentMethodInput,
} from '@shop/contract';
import { AddressPicker } from '~/components/address-picker';
import { track } from '~/lib/analytics/client';
import { useCartQuote } from '~/lib/use-cart-quote';
import { useCartStore } from '~/stores/cart';
import { formatMoney, formatNumber, type MessageKey } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';
import { CART_ISSUE_KEY } from '~/lib/i18n/cart-issue';
import { getSessionId, getAnonymousId } from '~/lib/analytics/session';
import { openPaymentWindow, isUsableClientKey } from '~/lib/payments/client';
import { useMemo } from 'react';

const METHOD_KEY: Record<PaymentMethodInput, MessageKey> = {
  CARD: 'payMethod.CARD',
  TRANSFER: 'payMethod.TRANSFER',
  VIRTUAL_ACCOUNT: 'payMethod.VIRTUAL_ACCOUNT',
  EASY_PAY: 'payMethod.EASY_PAY',
};

interface SavedAddress {
  id: string; label: string | null; recipient: string; phone: string;
  postalCode: string; address1: string; address2: string | null; isRemoteArea: boolean;
}

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

export function CheckoutForm({ defaultAddress: initialAddress }: { defaultAddress: SavedAddress | null }) {
  const t = useT();
  const locale = useLocale();
  const money = (amount: number) => formatMoney(locale, amount);
  const router = useRouter();

  /**
   * 배송지를 상태로 들고 있는다.
   *
   * 새로 등록한 뒤 서버 컴포넌트를 다시 받아 올 수도 있지만, 그러면 입력하던
   * 요청사항·포인트·선택한 결제 수단이 초기화된다. 방금 저장한 주소를 그대로
   * 화면에 반영하는 편이 낫다.
   */
  const [defaultAddress, setDefaultAddress] = useState<SavedAddress | null>(initialAddress);
  const [editingAddress, setEditingAddress] = useState(initialAddress === null);
  const items = useCartStore((s) => s.items);
  const selected = useMemo(() => items.filter((i) => i.selected), [items]);

  const [method, setMethod] = useState<PaymentMethodInput>('CARD');

  /**
   * 고를 수 있는 결제 수단.
   *
   * 간편결제는 토스 결제창에서 제공사(카카오페이·네이버페이…)를 함께
   * 지정해야 하는데 아직 그 연동을 하지 않았다. 그대로 두면 실제 키를 넣은
   * 환경에서 **간편결제만 조용히 Mock 으로 빠진다** — 결제창도 안 뜨는데
   * 주문은 결제 완료가 되는, 가장 나쁜 종류의 불일치다.
   * 그래서 실제 결제창을 쓸 때는 아예 보여 주지 않는다.
   */
  const realGateway = isUsableClientKey(process.env['NEXT_PUBLIC_TOSS_CLIENT_KEY']);
  const methods = useMemo(
    () => (realGateway ? PAYMENT_METHOD.filter((m) => m !== 'EASY_PAY') : PAYMENT_METHOD),
    [realGateway],
  );
  const [agreed, setAgreed] = useState(false);
  const [memo, setMemo] = useState('');
  const [pointsToUse, setPointsToUse] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /**
   * 이 결제 시도의 열쇠.
   *
   * **화면이 살아 있는 동안 같은 값을 쓴다.** 그래야 두 번 눌렀거나 응답을
   * 못 받아 다시 보냈을 때 서버가 같은 시도인 줄 알아본다. 매번 새로 만들면
   * 열쇠가 있어도 없는 것과 같다.
   */
  const [orderKey] = useState(newOrderKey);

  const quote = useCartQuote({
    items: selected,
    pointsToUse,
    isRemoteArea: defaultAddress?.isRemoteArea ?? false,
  });

  const q = quote.data;
  const broken = (q?.lines ?? []).filter((l) => l.issue !== null);
  const canOrder =
    !!defaultAddress && agreed && !pending && !!q && q.payable >= 0 && broken.length === 0
    && (q.lines.length > 0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    /*
     * **버튼이 눌리는 것을 막지 않으므로 여기서 막는다.**
     *
     * Button 은 disabled 대신 aria-disabled 를 쓴다 — 못 누르는 버튼은
     * 초점을 못 받아 왜 못 누르는지 들리지 않기 때문이고, 그 판단은 옳다.
     * 대신 눌리기는 하므로 조건을 핸들러가 지켜야 한다. 예전에는 배송지만
     * 보고 지나가서, 두 번 누르면 주문이 두 개 만들어졌다.
     */
    if (!canOrder || !defaultAddress) return;
    setError(null);
    setPending(true);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: selected.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        addressId: defaultAddress.id,
        ...(memo.trim() ? { deliveryMemo: memo.trim() } : {}),
        ...(pointsToUse > 0 ? { pointsToUse } : {}),
        paymentMethod: method,
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
      // 재고 문제면 금액을 다시 받아 화면을 갱신한다
      if (body.code === 'OUT_OF_STOCK') void quote.refetch();
      return;
    }

    const order = (await res.json()) as CreateOrderResponse;
    track('add_payment_info', { method });

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
    if (isUsableClientKey(clientKey) && method !== 'EASY_PAY') {
      // 주문에 들어간 항목은 결제창을 열기 전에 장바구니에서 뺀다.
      // 창이 뜨면 이 페이지는 떠나므로 뒤에서 지울 기회가 없다.
      for (const i of selected) useCartStore.getState().remove(i.variantId);
      try {
        await openPaymentWindow({
          clientKey,
          customerKey: getAnonymousId(),
          orderNo: order.orderNo,
          orderName:
            selected.length === 1
              ? (selected[0]?.productName ?? t('checkout.orderFallbackName'))
              : `${selected[0]?.productName ?? t('checkout.orderFallbackName')} ${t('order.moreItems', { count: selected.length - 1 })}`,
          amount: order.payable,
          method,
          origin: window.location.origin,
        });
      } catch {
        // 창을 닫거나 SDK 를 못 불러왔다. 주문은 이미 만들어져 있으므로
        // 주문 화면에서 다시 시도할 수 있다.
        router.push(`/order/${order.orderNo}?payment=failed`);
      }
      return;
    }

    setPending(true);
    const mockKey = `${method === 'VIRTUAL_ACCOUNT' ? 'mock_va' : 'mock'}_${order.orderNo}`;
    const confirmRes = await fetch(`/api/orders/${order.orderNo}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentKey: mockKey, amount: order.payable }),
    });
    setPending(false);

    // 주문에 들어간 항목만 장바구니에서 뺀다
    for (const i of selected) useCartStore.getState().remove(i.variantId);

    if (!confirmRes.ok) {
      // 주문은 만들어졌지만 결제가 실패했다. 주문 화면에서 다시 시도할 수 있다.
      const body = (await confirmRes.json()) as { message?: string };
      setError(`${body.message ?? t('checkout.approveFailed')} ${t('checkout.retryFromOrders')}`);
      router.push(`/order/${order.orderNo}`);
      return;
    }

    router.push(`/order/${order.orderNo}`);
  }

  if (selected.length === 0) {
    return (
      <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
        {t('checkout.nothing')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/*
        배송지는 주문 폼 **밖에** 둔다.
        <form> 안에 <form> 을 넣는 것은 HTML 이 허용하지 않는 구조라
        브라우저마다 동작이 다르다. 배송지는 자체 API 로 따로 저장하므로
        주문 폼의 일부일 이유도 없다 — 나란한 두 개의 폼이 맞다.
      */}
      <section aria-labelledby="addr-title">
        <h2 id="addr-title" className="mb-3.5 text-sm font-semibold">{t('checkout.address')}</h2>
        {defaultAddress && !editingAddress ? (
          <div className="flex items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4">
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-2">
                <span className="text-sm font-semibold">{defaultAddress.recipient}</span>
                {defaultAddress.label && <Badge tone="neutral">{defaultAddress.label}</Badge>}
              </p>
              <p className="tnum text-[13px] text-[var(--fg-secondary)]">{defaultAddress.phone}</p>
              <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
                {defaultAddress.address1} {defaultAddress.address2}{' '}
                <span className="tnum text-[var(--fg-muted)]">({defaultAddress.postalCode})</span>
              </p>
              {defaultAddress.isRemoteArea && (
                <p className="text-[12px] text-[var(--fg-muted)]">
                  {t('checkout.addressRemote')}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingAddress(true)}
            >
              {t('checkout.addressChange')}
            </Button>
          </div>
        ) : (
          <div className="rounded-sm border border-[var(--border)] p-4">
            {/*
              주소가 없으면 여기서 바로 입력한다. 예전에는 "배송지를 먼저
              등록해 주세요" 라고만 적혀 있었는데, 등록할 곳이 어디에도
              없어서 주문이 막다른 길이었다.
            */}
            {!defaultAddress && (
              <p className="mb-4 text-[13px] text-[var(--fg-secondary)]">
                {t('checkout.addressNew')}
              </p>
            )}
            <AddressPicker
              currentId={defaultAddress?.id ?? null}
              onPicked={(picked) => {
                setDefaultAddress(picked);
                setEditingAddress(false);
              }}
              onCancel={() => setEditingAddress(false)}
            />
          </div>
        )}
      </section>

      <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-8" noValidate>
        {/*
          제목을 따로 두지 않는다. Field 의 라벨이 이미 "배송 요청사항" 이라
          제목을 붙이면 스크린리더가 같은 말을 두 번 읽는다.
        */}
        <section>
          <Field
            label={t('checkout.memo')}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={t('checkout.memoPlaceholder')}
            maxLength={100}
          />
        </section>

      <section aria-labelledby="items-title">
        <h2 id="items-title" className="mb-3.5 text-sm font-semibold">
          {t('checkout.items')} <span className="tnum text-[var(--fg-muted)]">{selected.length}</span>
        </h2>
        <ul className="flex flex-col gap-3">
          {selected.map((i) => {
            const line = q?.lines.find((l) => l.variantId === i.variantId);
            return (
              <li key={i.variantId} className="flex items-center justify-between gap-3">
                {/*
                  결제 직전에 무엇을 사는지 다시 보여 준다. 장바구니에서
                  담을 때 본 것과 같은 사진이라야 대조가 된다.
                */}
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
                  <span className="text-[11px] text-[var(--fg-muted)]">
                    {i.optionLabel} · <span className="tnum">{i.quantity}</span>
                  </span>
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

      {q && q.pointsAvailable > 0 && (
        <section aria-labelledby="point-title">
          <h2 id="point-title" className="mb-3.5 text-sm font-semibold">{t('checkout.pointsHeading')}</h2>
          <div className="flex gap-2">
            <Field
              label={t('checkout.pointsLabel')}
              type="number"
              min={0}
              max={q.pointsAvailable}
              value={pointsToUse === 0 ? '' : String(pointsToUse)}
              onChange={(e) => setPointsToUse(Math.max(0, Number(e.target.value) || 0))}
              hint={t('checkout.pointsHint', {
                balance: `${formatNumber(locale, q.pointsAvailable)}P`,
                min: `${formatNumber(locale, MIN_POINTS_USE)}P`,
              })}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="lg"
              className="mt-7 h-12 w-24 shrink-0"
              onClick={() => setPointsToUse(q.pointsAvailable)}
            >
              {t('checkout.pointsAll')}
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="method-title">
        <h2 id="method-title" className="mb-3.5 text-sm font-semibold">{t('checkout.method')}</h2>
        {/*
          목록이 아니라 라디오 그룹이다. role 을 얹는 순간 ul 의 목록 의미가
          사라져서 그 안의 li 가 갈 곳을 잃는다 — 상품 옵션에서 같은 것을
          고쳤는데 여기 하나가 더 있었다. 훑기가 결제 화면을 지나가지 않아
          그동안 아무도 몰랐다.
        */}
        <div role="radiogroup" aria-labelledby="method-title" className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <div key={m}>
              <button
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={[
                  'h-12 w-full rounded-sm border text-sm',
                  method === m
                    ? 'border-n-900 bg-n-900 font-medium text-n-0'
                    : 'border-n-300 bg-[var(--bg)]',
                ].join(' ')}
              >
                {t(METHOD_KEY[m])}
              </button>
            </div>
          ))}
        </div>
        {/*
          무엇으로 도는지 사실대로 말한다. 결제창이 뜨지 않는데 주문이 완료되는
          것은 놀랄 일이므로 미리 알려야 하고, 반대로 실제 결제창이 뜰 때
          "연동이 안 됐다" 고 적혀 있으면 그것대로 사람을 헷갈리게 만든다.
        */}
        <p className="mt-3 rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
          {realGateway ? (
            <>
              {t('checkout.tossOn')}
            </>
          ) : (
            <>
              {t('checkout.tossOff')}
            </>
          )}
        </p>
      </section>

      <section aria-labelledby="total-title">
        <h2 id="total-title" className="mb-3.5 text-sm font-semibold">{t('checkout.total')}</h2>
        {quote.isPending || !q ? (
          <p className="text-[13px] text-[var(--fg-muted)]">{t('cart.calculating')}</p>
        ) : (
          <dl className="flex flex-col gap-2.5">
            <Row label={t('cart.subtotal')} value={money(q.listTotal)} />
            {q.productDiscount > 0 && (
              <Row label={t('cart.productDiscount')} value={`-${money(q.productDiscount)}`} accent />
            )}
            {q.couponDiscount > 0 && (
              <Row label={t('cart.couponDiscount')} value={`-${money(q.couponDiscount)}`} accent />
            )}
            {q.pointsUsed > 0 && (
              <Row label={t('cart.pointsUsed')} value={`-${money(q.pointsUsed)}`} accent />
            )}
            <Row
              label={t('cart.shippingFee')}
              value={q.shippingFee === 0 ? t('cart.freeShipping') : money(q.shippingFee)}
            />
            <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
              <dt className="text-[15px] font-semibold">{t('checkout.finalTotal')}</dt>
              <dd><Price amount={won(q.payable)} size="md" /></dd>
            </div>
          </dl>
        )}
      </section>

      <section aria-labelledby="agree-title">
        <h2 id="agree-title" className="sr-only">{t('checkout.terms')}</h2>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((v) => !v)}
          className="flex w-full items-start gap-2.5 text-left"
        >
          <span
            aria-hidden="true"
            className={[
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-[11px] font-semibold',
              agreed ? 'bg-n-900 text-n-0' : 'border border-n-300',
            ].join(' ')}
          >
            {agreed ? '✓' : ''}
          </span>
          <span className="text-[13px] leading-relaxed">
            {t('checkout.agree')}
          </span>
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-4 py-3 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <Button type="submit" block aria-disabled={!canOrder}>
        {pending
          ? t('checkout.submitting')
          : q
            ? t('checkout.pay', { amount: money(q.payable) })
            : t('checkout.submit')}
      </Button>
      </form>
    </div>
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
