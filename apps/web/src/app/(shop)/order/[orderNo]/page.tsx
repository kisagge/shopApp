import { notFound, redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  isCancellableByCustomer, canRequestReturn, isRepayable,
  type ReturnType, type ReturnReason, type ReturnStatus,
} from '@shop/core';
import { TrackingPanel } from '~/components/tracking-panel';
import { CancelOrderButton } from '~/components/cancel-order-button';
import { RepayButton } from '~/components/repay-button';
import { serverPaymentMode } from '~/lib/payments';
import { orderNameOf } from '~/lib/checkout/pay-order';
import { ReturnRequestForm } from '~/components/return-request-form';
import { getOrderForUser } from '~/lib/queries/orders';
import { NO_INDEX } from '~/lib/no-index';
import { formatMoney, formatNumber, type MessageKey } from '@shop/i18n';
import { getLocale, getT } from '~/lib/i18n/server';
import { ORDER_STATUS_KEY, RETURN_TYPE_KEY, RETURN_REASON_KEY, RETURN_STATUS_KEY } from '~/lib/i18n/enum-labels';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('order.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNo: string }>;
  /** 결제가 깨진 채 넘어왔는지 — place-order 가 `?payment=failed` 로 알려 준다 */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNo } = await params;
  const user = await getViewer();
  if (!user) redirect('/login');

  const [order, locale, t, query] = await Promise.all([
    getOrderForUser(orderNo, user.id),
    getLocale(),
    getT(),
    searchParams,
  ]);
  if (!order) notFound();

  /*
   * **결제를 다시 걸 수 있는 주문인가.**
   *
   * 판정은 `@shop/core` 의 `isRepayable` 이 한다 — 주문 상태만으로는 못
   * 가른다. 결제대기는 "승인이 안 된 것" 과 "가상계좌를 받아 입금을 기다리는
   * 것" 을 함께 가리키는데, 뒤엣것에 다시 걸면 이미 받은 계좌가 버려진다.
   *
   * 결제 방식은 서버가 정해서 내려 준다(`serverPaymentMode`) — 브라우저가
   * 스스로 정하다 서버와 갈려서 승인이 500 이 났던 적이 있다.
   */
  const repayable = isRepayable(order.status, order.payment?.status ?? null);
  const decided = repayable ? serverPaymentMode() : null;
  /** 결제를 걸 수 있는 방식. 막혀 있으면 단추를 세우지 않는다 — 눌러도 될 일이 없다 */
  const repayMode = decided && decided.mode !== 'blocked' ? decided.mode : null;
  /** 결제 화면에서 실패해 넘어왔는가. 갓 접수된 주문과 구분해야 한다 */
  const paymentFailed = query['payment'] === 'failed';

  const money = (amount: number) => formatMoney(locale, amount);

  const row = (label: string, value: string, accent = false) => (
    <div key={label} className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );

  /**
   * 이 화면은 주문 직후에도, 나중에 주문 내역에서 들어와도 열린다.
   * 그래서 문구가 상태를 따라가야 한다 — 배송중인 주문에 "결제가 확인되면
   * 배송 준비를 시작합니다" 라고 적혀 있으면 무슨 말인지 알 수 없다.
   */
  const headline = repayable
    ? /*
       * **결제가 안 끝난 주문에 "접수되었습니다" 라고 쓰면 안 된다.**
       * 아래에 "결제가 완료되지 않았습니다" 를 붙여 놓고 큰 제목은 접수됐다고
       * 말하면 둘 중 무엇을 믿어야 할지 알 수 없다. 화면을 못 보는 사람에게는
       * 더 나쁘다 — Next 의 경로 알림이 이 제목을 그대로 읽어 준다.
       */
      t('order.unpaidHeading')
    : order.status === 'PENDING'
      ? t('order.placedHeading')
      : order.status === 'CANCELLED' || order.status === 'REFUNDED'
        ? t('order.closedHeading')
        : t('order.heading');

  /** 다음에 무엇이 일어나는지. 갈래로 빠진 상태에는 할 말이 없다. */
  const NEXT_STEP: Partial<Record<typeof order.status, MessageKey>> = {
    PENDING: 'orderNote.PENDING',
    PAID: 'orderNote.PAID',
    PREPARING: 'orderNote.PREPARING',
    SHIPPED: 'orderNote.SHIPPED',
    DELIVERED: 'orderNote.DELIVERED',
    CONFIRMED: 'orderNote.CONFIRMED',
  };
  const nextStepKey = NEXT_STEP[order.status];
  const nextStep = nextStepKey ? t(nextStepKey) : null;

  const activeReturn = order.returnRequests[0] ?? null;
  /**
   * 신청 버튼은 신청할 수 있을 때만.
   *
   * 반려된 뒤에는 다시 낼 수 있어야 한다 — 사유를 잘못 골랐을 수도 있고,
   * 반려 사유를 보고 보완할 수도 있다. canRequestReturn 이 상태로 판단하므로
   * 반려로 배송중에 돌아왔으면 자연히 다시 보인다.
   */
  const showReturnForm = canRequestReturn({
    status: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
  });

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 md:px-10">
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        {/* 결제가 안 끝났는데 체크 표시를 띄우면 끝난 줄 안다 */}
        <span
          aria-hidden="true"
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
            repayable ? 'bg-accent-soft text-accent-hover' : 'bg-[var(--brand)] text-[var(--bg)]'
          }`}
        >
          {repayable ? '!' : '✓'}
        </span>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{headline}</h1>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('order.currentStatus', { status: t(ORDER_STATUS_KEY[order.status]) })}
          {nextStep && (
            <>
              <br />
              {nextStep}
            </>
          )}
        </p>
        <p className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--surface)] px-3.5">
          <span className="text-xs text-[var(--fg-muted)]">{t('order.number')}</span>
          <span className="tnum text-xs font-semibold">{order.orderNo}</span>
        </p>

        {/*
          **결제가 안 끝났다는 것을 화면이 말한다.**

          예전에는 이 화면이 갓 접수된 주문과 결제가 깨진 주문을 구분하지
          않고 똑같이 "주문이 접수되었습니다" 를 띄웠다. 그래서 사람은 결제가
          된 줄 알았고, 실제로는 재고만 물고 있는 주문이 남았다.

          `role="alert"` 은 결제 화면에서 실패해 막 넘어온 경우에만 쓴다 —
          나중에 주문 내역에서 다시 들어온 사람에게는 새로 난 일이 아니다.
        */}
        {repayable && (
          <p
            {...(paymentFailed ? { role: 'alert' as const } : { role: 'status' as const })}
            className="max-w-[420px] rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-hover"
          >
            {paymentFailed ? t('repay.failedNotice') : t('repay.pendingNotice')}
          </p>
        )}
      </div>

      {order.shipment && (
        <div className="border-t border-[var(--border)] pt-6">
          <TrackingPanel
            carrier={order.shipment.carrier}
            trackingNumber={order.shipment.trackingNumber}
            shippedAt={order.shipment.shippedAt}
          />
        </div>
      )}

      <section aria-labelledby="items-title" className="border-t border-[var(--border)] pt-6">
        <h2 id="items-title" className="mb-3.5 text-sm font-semibold">
          {t('checkout.items')} <span className="tnum text-[var(--fg-muted)]">{order.items.length}</span>
        </h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3">
              {/*
                **주문에 박아 둔 사진이다.** 살아 있는 상품에서 다시 읽지
                않는다 — 상품이 바뀌거나 지워져도 산 것은 그대로 남아야 한다.
                그래서 자리표시 그림은 없다: 그건 살아 있는 상품에서만
                따라오는 값이고, 여기 두려면 주문에도 칸을 하나 더 박아야 한다.
                작은 썸네일이라 그만한 값이 없다.
              */}
              {i.imageUrl && (
                <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                  <Image
                    src={i.imageUrl}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="44px"
                    className="object-cover"
                  />
                </span>
              )}
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{i.brandName}</span>
                <span className="text-[13px]">{i.productName}</span>
                <span className="text-[11px] text-[var(--fg-muted)]">
                  {i.optionLabel} · <span className="tnum">{i.quantity}</span>
                </span>
              </span>
              <span className="tnum text-sm font-semibold">{money(i.subtotal)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pay-title" className="mt-8 border-t border-[var(--border)] pt-6">
        <h2 id="pay-title" className="mb-3.5 text-sm font-semibold">{t('order.payInfo')}</h2>
        <dl className="flex flex-col gap-2.5">
          {row(t('cart.subtotal'), money(order.listTotal))}
          {order.productDiscount > 0 &&
            row(t('cart.productDiscount'), `-${money(order.productDiscount)}`, true)}
          {order.couponDiscount > 0 &&
            row(t('cart.couponDiscount'), `-${money(order.couponDiscount)}`, true)}
          {order.pointsUsed > 0 && row(t('cart.pointsUsed'), `-${money(order.pointsUsed)}`, true)}
          {row(
            t('cart.shippingFee'),
            order.shippingFee === 0 ? t('cart.freeShipping') : money(order.shippingFee),
          )}
          <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
            <dt className="text-[15px] font-semibold">{t('order.payable')}</dt>
            <dd className="tnum text-xl font-semibold">{money(order.payable)}</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-right text-[11px] text-[var(--fg-muted)]">
          {t('order.rewardOnConfirm', { points: formatNumber(locale, order.rewardPoints) })}
        </p>
      </section>

      <section aria-labelledby="ship-title" className="mt-8 border-t border-[var(--border)] pt-6">
        <h2 id="ship-title" className="mb-3.5 text-sm font-semibold">{t('order.shipTo')}</h2>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {order.recipient} · <span className="tnum">{order.recipientPhone}</span>
          <br />
          {order.address1} {order.address2} <span className="tnum">({order.postalCode})</span>
          {order.deliveryMemo && (
            <>
              <br />
              {t('order.memoPrefix')}: {order.deliveryMemo}
            </>
          )}
        </p>
      </section>

      {/*
        접수된 신청이 있으면 지금 어떤 상태인지 보여 준다.
        신청만 받고 아무것도 안 보여 주면 고객은 접수가 된 건지 알 수 없다.
      */}
      {activeReturn && (
        <section
          aria-labelledby="return-title"
          className="mt-8 rounded-sm border border-[var(--border)] p-4"
        >
          <h2 id="return-title" className="mb-3 text-sm font-semibold">
            {t('order.returnRequest', {
              type: t(RETURN_TYPE_KEY[activeReturn.type as ReturnType]),
            })}
          </h2>
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.returnStatusLabel')}
              </dt>
              <dd className="font-medium">
                {t(RETURN_STATUS_KEY[activeReturn.status as ReturnStatus])}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.returnReasonLabel')}
              </dt>
              <dd>{t(RETURN_REASON_KEY[activeReturn.reason as ReturnReason])}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.returnShipping')}
              </dt>
              <dd>
                {activeReturn.shippingBorneBy === 'CUSTOMER'
                  ? t('order.borneByCustomer')
                  : t('order.borneBySeller')}
              </dd>
            </div>
            {activeReturn.detail && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                  {t('order.returnDetail')}
                </dt>
                <dd className="leading-relaxed text-[var(--fg-secondary)]">{activeReturn.detail}</dd>
              </div>
            )}
          </dl>
          {activeReturn.status === 'REJECTED' && activeReturn.rejectReason && (
            <p className="mt-3 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
              {t('order.rejectReason')}: {activeReturn.rejectReason}
            </p>
          )}
        </section>
      )}

      <div className="mt-10 flex flex-col gap-3">
        {/* 다시 걸기가 취소보다 앞에 선다 — 여기 온 사람이 하려던 일이다 */}
        {repayMode && (
          <RepayButton
            orderNo={order.orderNo}
            payable={order.payable}
            method={order.payment?.method ?? 'CARD'}
            orderName={orderNameOf(order.items, t)}
            paymentMode={repayMode}
          />
        )}
        {isCancellableByCustomer(order.status) && (
          <CancelOrderButton orderNo={order.orderNo} />
        )}
        {showReturnForm && <ReturnRequestForm orderNo={order.orderNo} status={order.status} />}
        <div className="flex gap-2">
          <Link
            href="/mypage/orders"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-sm border border-[var(--border-strong)] text-sm font-medium no-underline"
          >
            {t('order.heading')}
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-sm bg-[var(--brand)] text-sm font-medium text-[var(--bg)] no-underline"
          >
            {t('order.keepShopping')}
          </Link>
        </div>
      </div>
    </div>
  );
}
