'use client';

import { useState, useMemo, type FormEvent } from 'react';
import { Badge, Button, Field } from '@shop/ui';
import { MIN_POINTS_USE, PAYMENT_METHOD_CODE, orderBlocker } from '@shop/core';
import type { PaymentMethodInput } from '@shop/contract';
import { AddressPicker } from '~/components/address-picker';
import { OrderItems } from '~/components/checkout/order-items';
import { PaymentMethods } from '~/components/checkout/payment-methods';
import { CouponPicker } from '~/components/checkout/coupon-picker';
import { OrderTotal } from '~/components/checkout/order-total';
import { usePlaceOrder } from '~/lib/checkout/place-order';
import { useCartQuote } from '~/lib/use-cart-quote';
import { useCartStore } from '~/stores/cart';
import { track } from '~/lib/analytics/client';
import { formatMoney, formatNumber } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';
import type { PaymentMode } from '@shop/core';

interface SavedAddress {
  id: string; label: string | null; recipient: string; phone: string;
  postalCode: string; address1: string; address2: string | null; isRemoteArea: boolean;
}

/**
 * 주문서.
 *
 * **여기 남은 것은 상태와 짜임뿐이다.** 무엇을 사는지·어떻게 낼지·얼마인지를
 * 그리는 일은 checkout/ 아래로 나갔고, 주문을 만들어 결제까지 가는 흐름은
 * lib/checkout/place-order 가 맡는다.
 *
 * 나눈 기준은 줄 수가 아니라 **바뀌는 이유**다. 화면 조각은 문구와 배치가
 * 바뀌고, 주문 흐름은 결제사와 서버 계약이 바뀐다. 한 파일에 두면 그 둘이
 * 서로를 가려서, 돈이 걸린 자리를 고칠 때마다 250줄짜리 JSX 를 헤치고
 * 들어가야 했다.
 */
export function CheckoutForm({
  defaultAddress: initialAddress,
  paymentMode,
}: {
  defaultAddress: SavedAddress | null;
  /** 서버가 정한 결제 방식. 브라우저는 다시 정하지 않는다 — place-order.ts 주석 참고 */
  paymentMode: PaymentMode;
}) {
  const t = useT();
  const locale = useLocale();
  const money = (amount: number) => formatMoney(locale, amount);

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
  const realGateway = paymentMode === 'window';
  const methods = useMemo(
    () => (realGateway ? PAYMENT_METHOD_CODE.filter((m) => m !== 'EASY_PAY') : PAYMENT_METHOD_CODE),
    [realGateway],
  );

  const [agreed, setAgreed] = useState(false);
  const [memo, setMemo] = useState('');
  const [pointsToUse, setPointsToUse] = useState(0);

  /*
   * 사람이 고른 쿠폰. **셋을 구분한다.**
   *   undefined — 아직 고른 적 없음 (우리가 가장 나은 것을 붙여 준다)
   *   null      — 쓰지 않겠다고 고름
   *   문자열    — 그 쿠폰을 고름
   *
   * 셋을 둘로 줄이면 "쓰지 않기" 를 고른 사람에게 다음 견적에서 쿠폰이 다시
   * 붙는다. 그리고 이것을 **이펙트로 세우지 않는다** — 이펙트에서 setState 를
   * 하면 렌더가 한 번 더 돌고, 그 사이 화면에는 쿠폰이 없는 금액이 보인다.
   * 고른 적 없으면 제안을 쓰는 것뿐이니 파생시키면 된다.
   */
  const [choice, setChoice] = useState<string | null | undefined>(undefined);

  /*
   * 주문 만들기부터 결제 승인까지는 훅이 맡는다. 요청이 둘이고 그 사이에
   * 브라우저가 다른 곳으로 떠날 수 있는 흐름이라, 화면 사이에 끼워 두면
   * 어디서 끝나는지 읽을 수 없다.
   */
  const { place, pending, error } = usePlaceOrder(paymentMode);

  /*
   * **고른 적이 없으면 서버가 가장 나은 것을 붙인다.** 화면은 무엇이 붙었는지
   * 응답에서 읽는다 — 여기서 고르면 서버가 정한 금액과 어긋날 자리가 생긴다.
   */
  const quote = useCartQuote({
    items: selected,
    ...(typeof choice === 'string' ? { couponCode: choice } : {}),
    ...(choice === null ? { useCoupon: false } : {}),
    pointsToUse,
    isRemoteArea: defaultAddress?.isRemoteArea ?? false,
  });

  const q = quote.data;
  const broken = (q?.lines ?? []).filter((l) => l.issue !== null);
  /*
   * **무엇이 막는지 고르는 규칙은 core 에 있다.** 조건이 다섯이라 낭독기에
   * "결제하기, 사용 불가" 만 들려서는 무엇을 손대야 할지 알 수 없다.
   * 견적이 아직 안 왔거나 보내는 중인 것은 사용자가 손댈 일이 아니라
   * 이유로 말하지 않는다 — 그때는 버튼 이름이 이미 '보내는 중' 이다.
   */
  const blocker = orderBlocker({
    lineCount: q?.lines.length ?? 0,
    brokenCount: broken.length,
    hasAddress: !!defaultAddress,
    agreed,
  });
  const canOrder = blocker === null && !pending && !!q && q.payable >= 0;
  /*
   * 보내는 중에는 이유를 말하지 않는다 — 위 주석의 뜻이 그것인데, 정작 아래
   * 렌더는 이유가 있으면 늘 세우고 있었다. 결제가 끝나 장바구니를 비우는
   * 순간 이유가 `empty` 로 바뀌어, 결제를 누른 사람에게 **"주문할 상품이
   * 없습니다"** 라고 말했다. 지금 손댈 일이 없는 사람에게 손댈 곳을 알려
   * 주는 셈이다.
   */
  const shownBlocker = pending ? null : blocker;

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
    if (!canOrder || !defaultAddress || !q) return;

    const { refetchQuote } = await place({
      items: selected,
      addressId: defaultAddress.id,
      memo,
      pointsToUse,
      // 견적에 붙은 것을 그대로 주문에 싣는다 — 서버가 골라 준 것도 포함이다
      ...(q.couponCode ? { couponCode: q.couponCode } : {}),
      method,
      payable: q.payable,
    });

    // 재고 문제로 막힌 것이면 금액을 다시 받아 화면을 갱신한다
    if (refetchQuote) void quote.refetch();
  }

  /*
   * **주문이 도는 중에는 빈 상태를 세우지 않는다.**
   *
   * 결제가 끝나면 주문에 들어간 것을 장바구니에서 빼는데, 그 순간 이 화면이
   * "주문할 상품이 없습니다" 로 바뀐다. 주소가 주문 화면으로 바뀌기까지는
   * 0.6~1초가 더 걸리므로, 결제를 누른 사람은 그 사이 **장바구니가 비었다는
   * 말**을 보게 된다. 기기에서 실제로 그렇게 보였다.
   *
   * 빈 장바구니로 이 화면에 들어온 사람에게는 그대로 이 문구가 필요하다.
   * 가르는 것은 "지금 주문이 도는 중인가" 하나다.
   */
  if (selected.length === 0 && !pending) {
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
                /*
                 * 주문서에서 배송지를 정한 순간이다. 이미 기본 배송지가
                 * 있는 사람은 여기를 지나지 않으므로, 이 이벤트의 수는
                 * **주소를 새로 넣어야 했던 사람**의 수가 된다 — 결제까지
                 * 가는 길에서 어디가 걸리는지 보는 값이다.
                 */
                track('add_shipping_info', { remote: picked.isRemoteArea });
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

      <OrderItems items={selected} quote={q} money={money} />

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

      <CouponPicker
        offers={q?.coupons ?? []}
        selected={q?.couponCode ?? null}
        autoPicked={choice === undefined && (q?.couponCode ?? null) !== null}
        onSelect={setChoice}
        money={money}
      />

      <PaymentMethods
        methods={methods}
        method={method}
        onSelect={setMethod}
        realGateway={realGateway}
      />

      <OrderTotal quote={q} pending={quote.isPending} money={money} />

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

      {/* 이유가 있으면 버튼이 그것을 가리킨다 — 눈으로도 보이고 낭독기도 읽는다 */}
      {shownBlocker && (
        <p id="order-blocked" className="text-center text-xs text-[var(--fg-muted)]">
          {t(`checkout.blocked.${shownBlocker}`)}
        </p>
      )}

      <Button
        type="submit"
        block
        aria-disabled={!canOrder}
        aria-describedby={shownBlocker ? 'order-blocked' : undefined}
      >
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
