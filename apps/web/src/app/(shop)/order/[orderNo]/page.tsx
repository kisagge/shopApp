import { notFound, redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  isReturnableLine, isReceiptIssuable, receiptTotals, carrierOf, formatTrackingNumber,
  returnAddressLine, trackingUrlFor, orderLineReviewLink, orderView,
  type OrderHeadline, type ReturnDestination, type ReturnType, type ReturnReason, type ReturnStatus,
} from '@shop/core';
import { TrackingPanel } from '~/components/tracking-panel';
import { CancelOrderButton } from '~/components/cancel-order-button';
import { CancelItemsForm } from '~/components/cancel-items-form';
import { RepayButton } from '~/components/repay-button';
import { LateDepositNotice } from '~/components/late-deposit-notice';
import { ReorderButton } from '~/components/reorder-button';
import { ConfirmPurchaseButton } from '~/components/confirm-purchase-button';
import { serverPaymentMode } from '~/lib/payments';
import { orderNameOf } from '~/lib/checkout/pay-order';
import { ReturnRequestForm } from '~/components/return-request-form';
import { approvedReturnDestinations } from '~/lib/orders/return-address';
import { getOrderForUser, getExchangeOptions, getDisplayedProductSlugs, type ExchangeOption } from '~/lib/queries/orders';
import { NO_INDEX } from '~/lib/no-index';
import { formatMoney, formatNumber, formatDateTime, type MessageKey } from '@shop/i18n';
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
  // 돌아올 곳을 들고 간다 — 영수증 화면이 진작 그렇게 한다. 없으면 로그인한 뒤 첫 화면에 떨어진다
  if (!user) redirect(`/login?next=${encodeURIComponent(`/order/${orderNo}`)}`);

  const [order, locale, t, query] = await Promise.all([
    getOrderForUser(orderNo, user.id),
    getLocale(),
    getT(),
    searchParams,
  ]);
  if (!order) notFound();

  const liveItems = order.items.filter((i) => i.canceledAt === null);
  const activeReturn = order.returnRequests[0] ?? null;

  /*
   * **무엇을 세우고 무엇을 감출지는 core 가 정한다.**
   *
   * 판정 하나하나(다시 결제할 수 있는가·반품 신청을 낼 수 있는가·구매확정할 수 있는가)는
   * 진작 순수 함수였는데, **그것들을 어떻게 엮는지는 이 화면에만 있었다.** 600줄짜리
   * 컴포넌트 사이에 흩어져 있어서 "언제 일부 취소 단추가 보이는가" 를 고치려면 JSX 를
   * 뒤져야 했고, 그 조합이 맞는지는 e2e 를 통째로 돌려야 알 수 있었다.
   */
  const view = orderView({
    status: order.status,
    payment: order.payment,
    itemCount: order.items.length,
    liveItemCount: liveItems.length,
    deliveredAt: order.deliveredAt,
    // 상태는 String 칸이라 모양을 좁혀 넘긴다 — 아래 화면들도 같은 자리에서 같은 좁힘을 한다
    returnStatus: (activeReturn?.status as ReturnStatus | undefined) ?? null,
    now: new Date(),
    /** 결제 화면에서 실패해 넘어왔는가. 갓 접수된 주문과 구분해야 한다 */
    paymentFailed: query['payment'] === 'failed',
    /** 방금 확정했는가 — 단추가 사라지므로 결과는 이 화면이 남긴다(confirm-purchase-button) */
    confirmedJustNow: query['confirmed'] === '1',
  });

  /*
   * 결제 방식은 서버가 정해서 내려 준다(`serverPaymentMode`) — 브라우저가 스스로 정하다
   * 서버와 갈려서 승인이 500 이 났던 적이 있다. 막혀 있으면 단추를 세우지 않는다.
   */
  const decided = view.repayable ? serverPaymentMode() : null;
  const repayMode = decided && decided.mode !== 'blocked' ? decided.mode : null;

  const money = (amount: number) => formatMoney(locale, amount);

  const row = (label: string, value: string, accent = false) => (
    <div key={label} className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );

  /** 큰 제목이 할 말은 core 가 고르고(orderView), 여기서는 그 말을 옮기기만 한다 */
  const HEADLINE_KEY: Readonly<Record<OrderHeadline, MessageKey>> = {
    unpaid: 'order.unpaidHeading',
    placed: 'order.placedHeading',
    closed: 'order.closedHeading',
    default: 'order.heading',
  };
  const headline = t(HEADLINE_KEY[view.headline]);

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

  // 영수증과 같은 함수로 더한다 — 따로 더하면 두 화면의 환불 합이 갈린다
  const { refundedCash, refundedPoints, shippingDeducted } = receiptTotals(order.payable, order.refunds);

  const returnableItems = order.items.filter(isReturnableLine);
  /*
   * 셋을 한 번에 던진다 — 서로의 결과를 쓰지 않는데 줄줄이 기다리면 왕복이 세 번 직렬로 쌓인다.
   *
   * - 보낼 곳: **승인하고 아직 안 왔을 때만** 읽는다(core showsReturnAddress). 판매처가 둘이면
   *   주소도 둘이다 — 한 주소만 적어 주면 한쪽 물건이 남의 창고로 간다.
   * - 교환 옵션: 폼을 띄울 때만. 같은 상품·같은 가격·재고가 있는 것.
   * - 상품 링크: 줄마다 상품 화면으로. 매대에 나와 있는 상품만.
   */
  const [returnTo, exchangeOptions, productSlugs] = await Promise.all<
    [Promise<ReturnDestination[]>, Promise<Record<string, ExchangeOption[]>>, Promise<ReadonlyMap<string, string>>]
  >([
    activeReturn ? approvedReturnDestinations(order.items, activeReturn) : Promise.resolve([]),
    view.showReturnForm ? getExchangeOptions(returnableItems) : Promise.resolve({}),
    getDisplayedProductSlugs(order.items.map((i) => i.variant.productId)),
  ]);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 md:px-10">
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        {/* 결제가 안 끝났는데 체크 표시를 띄우면 끝난 줄 안다 */}
        <span
          aria-hidden="true"
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
            view.repayable ? 'bg-accent-soft text-accent-hover' : 'bg-[var(--brand)] text-[var(--bg)]'
          }`}
        >
          {view.repayable ? '!' : '✓'}
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
        {view.justConfirmed && (
          <p role="status" className="max-w-[420px] rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
            {order.rewardPoints > 0
              ? t('purchase.confirmed', { points: formatNumber(locale, order.rewardPoints) })
              : t('purchase.confirmedNoPoints')}
          </p>
        )}

        {view.repayable && (
          <p
            {...(view.paymentFailed ? { role: 'alert' as const } : { role: 'status' as const })}
            className="max-w-[420px] rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-hover"
          >
            {view.paymentFailed ? t('repay.failedNotice') : t('repay.pendingNotice')}
          </p>
        )}

        <LateDepositNotice payment={order.payment} locale={locale} t={t} />

        {/*
          **입금할 곳.**

          계좌 셋을 결제 때 저장해 두고 읽는 곳이 없어서, 이 화면은 "결제가 확인되면
          배송 준비를 시작합니다" 만 말했다. 번호를 볼 수 있는 곳은 결제 직후 한 번
          뜨는 응답과 메일뿐이라, 탭을 닫았거나 메일이 스팸함에 갔으면 **그 주문은
          화면에서 입금할 방법이 없었다.**

          여기는 재결제 안내(위)와 겹치지 않는다 — 입금 대기는 isRepayable 이 일부러
          빼는 자리다. 할 일이 송금이지 재결제가 아니라서 맞는 판단인데, 그것이
          "아무 말도 안 한다" 가 되어 있었다.
        */}
        {view.deposit && (
          <section
            aria-labelledby="view.deposit-title"
            className="max-w-[420px] rounded-sm border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3"
          >
            <h2 id="view.deposit-title" className="text-[13px] font-semibold">
              {view.depositExpired ? t('deposit.expiredHeading') : t('deposit.heading')}
            </h2>
            <p
              role="status"
              className="mt-1 text-[12px] leading-relaxed text-[var(--fg-secondary)]"
            >
              {view.depositExpired ? t('deposit.expiredNotice') : t('deposit.notice')}
            </p>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {view.deposit.bank && (
                <>
                  <dt className="text-[var(--fg-muted)]">{t('deposit.bank')}</dt>
                  <dd>{view.deposit.bank}</dd>
                </>
              )}
              <dt className="text-[var(--fg-muted)]">{t('deposit.account')}</dt>
              {/* 옮겨 적는 번호다 — 자릿수가 흔들리지 않게 tnum 을 준다 */}
              <dd className="tnum font-medium">{view.deposit.account}</dd>
              {view.deposit.dueDate && (
                <>
                  <dt className="text-[var(--fg-muted)]">{t('deposit.due')}</dt>
                  <dd className="tnum">
                    <time dateTime={view.deposit.dueDate.toISOString()}>
                      {formatDateTime(locale, view.deposit.dueDate)}
                    </time>
                  </dd>
                </>
              )}
              <dt className="text-[var(--fg-muted)]">{t('deposit.amount')}</dt>
              <dd className="tnum font-medium">{money(order.payable)}</dd>
            </dl>
          </section>
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
          {order.items.map((i) => (
            <li key={i.id} className={`flex items-center justify-between gap-3 ${i.canceledAt ? 'opacity-60' : ''}`}>
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
                <span className="text-[13px]">
                  {/*
                    **산 물건의 화면으로 간다.** 다시 사거나 설명을 다시 보려면 검색부터 해야 했다. 내린 상품은
                    링크를 걸지 않는다 — 404 로 끝나는 막다른 길이다. 이름은 주문에 박힌 그때의 이름이다.
                  */}
                  {productSlugs.has(i.variant.productId) ? (
                    <Link href={`/product/${productSlugs.get(i.variant.productId)!}`} className="text-[var(--fg)] underline-offset-2 hover:underline">
                      {i.productName}
                    </Link>
                  ) : (
                    i.productName
                  )}
                  {/* 흐리게만 하면 색을 못 보는 사람에게는 취소됐는지 알 길이 없다 */}
                  {(i.canceledAt || i.status === 'RETURN_REQUESTED') && (
                    <span className="ml-1.5 rounded-full border border-[var(--border-strong)] px-1.5 py-px text-[10px] text-[var(--fg-secondary)]">
                      {t(
                        i.status === 'RETURN_REQUESTED'
                          ? activeReturn?.type === 'EXCHANGE' ? 'order.lineExchanging' : 'order.lineReturning'
                          : i.status === 'REFUNDED' && order.status !== 'REFUNDED'
                            ? 'order.lineRefunded'
                            : 'order.lineCanceled',
                      )}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-[var(--fg-muted)]">
                  {i.optionLabel} · <span className="tnum">{i.quantity}</span>
                </span>
                {(() => {
                  const review = orderLineReviewLink({
                    orderStatus: order.status, lineCanceled: i.canceledAt !== null, review: i.review,
                  });
                  if (!review) return null;
                  /*
                   * **주문을 보다가 후기로 간다.** 받은 물건을 확인하는 자리가 후기를 떠올리는 자리인데, 다른 메뉴에서
                   * 그 줄을 다시 찾아야 했다. 링크 이름에 상품명을 붙인다 — "후기 쓰기" 가 여럿이면 어느 것인지 모른다.
                   */
                  return (
                    <Link
                      href={review.kind === 'EDIT'
                        ? `/mypage/reviews/${review.reviewId}/edit`
                        : `/mypage/reviews#review-item-${i.id}`}
                      className="mt-1 w-fit text-[11px] text-[var(--fg-secondary)] underline underline-offset-2"
                    >
                      {t(review.kind === 'EDIT' ? 'order.lineEditReview' : 'order.lineWriteReview')}
                      <span className="sr-only"> — {i.productName}</span>
                    </Link>
                  );
                })()}
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
          {/*
            **돌려준 것을 결제 금액 아래에 따로 적는다.** 결제 금액을 줄여 보여 주면 카드 명세서와
            안 맞는다 — 결제는 그 금액으로 됐고, 그중 일부가 돌아왔다.
          */}
          {refundedCash > 0 && row(t('order.refundedCash'), `-${money(refundedCash)}`, true)}
          {refundedPoints > 0 && row(t('order.refundedPoints'), `${formatNumber(locale, refundedPoints)}P`)}
          {shippingDeducted > 0 && row(t('order.shippingDeducted'), money(shippingDeducted))}
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
            {activeReturn.exchangeLines.length > 0 && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                  {t('order.exchangeLines')}
                </dt>
                <dd>
                  {activeReturn.exchangeLines.map((l) => {
                    const item = order.items.find((i) => i.id === l.orderItemId);
                    return (
                      <span key={l.orderItemId} className="block">
                        {item?.productName} ({l.fromOptionLabel} → {l.toOptionLabel}) × {l.quantity}
                      </span>
                    );
                  })}
                </dd>
              </div>
            )}
            {activeReturn.reshipTrackingNumber && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                  {t('order.exchangeReship')}
                </dt>
                <dd className="tnum">
                  {carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier}{' '}
                  {formatTrackingNumber(activeReturn.reshipTrackingNumber)}
                  {/*
                    **새로 보낸 물건도 조회할 수 있어야 한다.** 첫 배송에는 조회 링크가 있는데 교환 송장은 번호만
                    적혀 있어, 손님이 택배사 누리집에 번호를 옮겨 적어야 했다. 같은 규칙(trackingUrlFor)으로 건다.
                  */}
                  {(() => {
                    const url = trackingUrlFor(activeReturn.reshipCarrier ?? '', activeReturn.reshipTrackingNumber);
                    if (!url) return null;
                    const carrierName = carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier ?? '';
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 font-sans text-[12px] text-[var(--fg-secondary)] underline underline-offset-2"
                      >
                        {t('track.openAt', { carrier: carrierName })}
                        <span className="sr-only"> {t('track.newWindow')}</span>
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    );
                  })()}
                </dd>
              </div>
            )}
            {activeReturn.detail && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                  {t('order.returnDetail')}
                </dt>
                <dd className="leading-relaxed text-[var(--fg-secondary)]">{activeReturn.detail}</dd>
              </div>
            )}
          </dl>
          {/*
            까닭은 **끝난 신청 모두**에 보여 준다. 반려에만 보여 주다가, 승인된 교환을 무를 수 있게 되면서
            철회된 신청에는 "철회됨" 만 뜨고 왜인지는 어디에도 없었다 — 승인을 받고 기다리던 사람에게 그건
            물건이 그냥 사라진 것으로 읽힌다.
          */}
          {(activeReturn.status === 'REJECTED' || activeReturn.status === 'CANCELLED') && activeReturn.rejectReason && (
            <p className="mt-3 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
              {t(activeReturn.status === 'CANCELLED' ? 'order.withdrawReason' : 'order.rejectReason')}
              : {activeReturn.rejectReason}
            </p>
          )}
        </section>
      )}

      {/*
        **승인했으면 어디로 보낼지 적어 준다.** "상품을 보내 주세요" 만 있고 주소가 없으면 손님은 받은 상자에 적힌
        출고지로 보내거나 고객센터에 묻는다 — 출고지가 물류 대행사면 물건이 엉뚱한 곳에 도착해 아무도 확인하지 못한다.
        판매처가 둘이면 주소도 둘이고, 그때는 상자를 나눠야 한다는 것을 먼저 말한다.
      */}
      {returnTo.length > 0 && (
        <section
          aria-labelledby="return-to-title"
          className="mt-4 rounded-sm border border-[var(--border-strong)] p-4"
        >
          <h2 id="return-to-title" className="mb-2 text-sm font-semibold">{t('order.returnTo')}</h2>
          <p className="text-[12px] leading-relaxed text-[var(--fg-secondary)]">
            {t('order.returnToNote')}
            {returnTo.length > 1 && <> {t('order.returnToSplit')}</>}
          </p>

          <ul className="mt-3 flex flex-col gap-3">
            {returnTo.map((destination) => {
              const address = destination.address;
              if (!address) return null;
              const lines = order.items.filter((i) => destination.itemIds.includes(i.id));
              return (
                <li
                  key={destination.merchantId ?? 'platform'}
                  className="rounded-sm bg-[var(--surface-1)] p-3.5 text-[13px] leading-relaxed"
                >
                  <address className="not-italic">
                    <span className="block font-medium">
                      {t('order.returnToRecipient')} {address.recipient}
                    </span>
                    <span className="block">{returnAddressLine(address)}</span>
                    <span className="tnum block text-[var(--fg-secondary)]">
                      {t('order.returnToPhone')} {address.phone}
                    </span>
                  </address>
                  {returnTo.length > 1 && lines.length > 0 && (
                    <p className="mt-1.5 text-[12px] text-[var(--fg-secondary)]">
                      {t('order.returnToItems')}:{' '}
                      {lines.map((i) => `${i.productName} (${i.optionLabel})`).join(', ')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          <p className="mt-3 text-[12px] text-[var(--fg-muted)]">
            {t('order.returnToTip', { orderNo: order.orderNo })}
          </p>
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
        {view.canCancelItems && (
          <CancelItemsForm
            orderNo={order.orderNo}
            items={liveItems.map((i) => ({
              id: i.id, productName: i.productName, optionLabel: i.optionLabel,
              quantity: i.quantity, subtotal: i.subtotal,
            }))}
          />
        )}
        {view.canCancel && (
          <CancelOrderButton orderNo={order.orderNo} />
        )}
        {view.canConfirmPurchase && (
          <ConfirmPurchaseButton orderNo={order.orderNo} points={formatNumber(locale, order.rewardPoints)} />
        )}
        {view.showReturnForm && (
          <ReturnRequestForm
            orderNo={order.orderNo}
            status={order.status}
            // 받았거나 받는 중인 줄만. 이미 돈이 돌아간 줄은 돌려보낼 것이 아니다
            items={returnableItems.map((i) => ({
              id: i.id, productName: i.productName, optionLabel: i.optionLabel, quantity: i.quantity,
              variantId: i.variant.id, exchangeOptions: exchangeOptions[i.id] ?? [],
            }))}
          />
        )}
        {isReceiptIssuable(order) && (
          <Link
            href={`/order/${encodeURIComponent(order.orderNo)}/receipt`}
            className="inline-flex h-12 items-center justify-center rounded-sm border border-[var(--border-strong)] text-sm font-medium no-underline"
          >
            {t('receipt.link')}
          </Link>
        )}
        {/*
          **다시 사는 길.** 주문 줄은 옵션 id 를 그대로 갖고 있는데 연결한 곳이 없었다.
          상태를 가리지 않는다 — 취소한 주문을 다시 사려는 것도 자연스럽고, 취소한 줄은
          담지 않고 그렇다고 말한다(core 의 planReorder).
        */}
        <ReorderButton orderNo={order.orderNo} />
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
