import { notFound, redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import {
  isCancellableByCustomer, canRequestReturn, isRepayable, isReturnableLine, isPaidStatus,
  isReceiptIssuable, receiptTotals, carrierOf, formatTrackingNumber, canConfirmPurchase, isOpenReturn,
  returnAddressLine, awaitingDeposit, depositExpired, trackingUrlFor, orderLineReviewLink,
  type ReturnType, type ReturnReason, type ReturnStatus,
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
import { getOrderForUser, getExchangeOptions, getDisplayedProductSlugs } from '~/lib/queries/orders';
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

  /*
   * 입금할 곳. 계좌번호가 없으면(옛 주문이나 PG 가 안 준 경우) 보여 줄 것이 없다 —
   * 빈 칸이 늘어선 덩이는 "번호가 사라졌다" 로 읽힌다.
   */
  const pay = order.payment;
  const deposit =
    pay && awaitingDeposit(pay.method, pay.status) && pay.virtualAccount
      ? { bank: pay.virtualBank, account: pay.virtualAccount, dueDate: pay.virtualDueDate }
      : null;
  const expired = deposit !== null && depositExpired(deposit.dueDate);
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

  /*
   * **일부 상품 취소를 열어 주는 조건.** 서버가 같은 조건으로 다시 막는다(cancel-items) —
   * 여기서는 눌러 봐야 거절될 단추를 세우지 않으려는 것뿐이다. 남은 상품이 하나면 그건
   * 주문 취소다.
   */
  const liveItems = order.items.filter((i) => i.canceledAt === null);
  const canCancelItems =
    order.status === 'PAID' &&
    order.payment !== null && isPaidStatus(order.payment.status) &&
    order.payment.method !== 'VIRTUAL_ACCOUNT' &&
    // 남은 줄이 하나여도 세운다 — 부품이 단추를 감추고, 방금 끝난 취소의 안내를 남긴다
    order.items.length >= 2 &&
    liveItems.length >= 1;

  // 영수증과 같은 함수로 더한다 — 따로 더하면 두 화면의 환불 합이 갈린다
  const { refundedCash, refundedPoints, shippingDeducted } = receiptTotals(order.payable, order.refunds);

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
  const returnableItems = order.items.filter(isReturnableLine);
  const openReturn = activeReturn !== null && isOpenReturn(activeReturn.status);
  const canConfirm = canConfirmPurchase({ status: order.status, hasOpenReturn: openReturn });
  /** 방금 확정했는가 — 단추가 사라지므로 결과는 이 화면이 남긴다(confirm-purchase-button) */
  const justConfirmed = query['confirmed'] === '1' && order.status === 'CONFIRMED';
  /*
   * 승인한 신청의 보낼 곳. **승인하고 아직 안 왔을 때만** 읽는다 — 그때만 보여 준다(core showsReturnAddress).
   * 판매처가 둘이면 주소도 둘이다. 한 주소만 적어 주면 한쪽 물건이 남의 창고로 간다.
   */
  const returnTo = activeReturn ? await approvedReturnDestinations(order.items, activeReturn) : [];

  // 폼을 띄울 때만 읽는다 — 교환으로 바꿀 수 있는 옵션(같은 상품·같은 가격·재고)
  const exchangeOptions = showReturnForm ? await getExchangeOptions(returnableItems) : {};
  // 줄마다 상품 화면으로 가는 링크 — 매대에 나와 있는 상품만
  const productSlugs = await getDisplayedProductSlugs(order.items.map((i) => i.variant.productId));

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
        {justConfirmed && (
          <p role="status" className="max-w-[420px] rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
            {order.rewardPoints > 0
              ? t('purchase.confirmed', { points: formatNumber(locale, order.rewardPoints) })
              : t('purchase.confirmedNoPoints')}
          </p>
        )}

        {repayable && (
          <p
            {...(paymentFailed ? { role: 'alert' as const } : { role: 'status' as const })}
            className="max-w-[420px] rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] leading-relaxed text-accent-hover"
          >
            {paymentFailed ? t('repay.failedNotice') : t('repay.pendingNotice')}
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
        {deposit && (
          <section
            aria-labelledby="deposit-title"
            className="max-w-[420px] rounded-sm border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-3"
          >
            <h2 id="deposit-title" className="text-[13px] font-semibold">
              {expired ? t('deposit.expiredHeading') : t('deposit.heading')}
            </h2>
            <p
              role="status"
              className="mt-1 text-[12px] leading-relaxed text-[var(--fg-secondary)]"
            >
              {expired ? t('deposit.expiredNotice') : t('deposit.notice')}
            </p>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              {deposit.bank && (
                <>
                  <dt className="text-[var(--fg-muted)]">{t('deposit.bank')}</dt>
                  <dd>{deposit.bank}</dd>
                </>
              )}
              <dt className="text-[var(--fg-muted)]">{t('deposit.account')}</dt>
              {/* 옮겨 적는 번호다 — 자릿수가 흔들리지 않게 tnum 을 준다 */}
              <dd className="tnum font-medium">{deposit.account}</dd>
              {deposit.dueDate && (
                <>
                  <dt className="text-[var(--fg-muted)]">{t('deposit.due')}</dt>
                  <dd className="tnum">
                    <time dateTime={deposit.dueDate.toISOString()}>
                      {formatDateTime(locale, deposit.dueDate)}
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
          {activeReturn.status === 'REJECTED' && activeReturn.rejectReason && (
            <p className="mt-3 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
              {t('order.rejectReason')}: {activeReturn.rejectReason}
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
        {canCancelItems && (
          <CancelItemsForm
            orderNo={order.orderNo}
            items={liveItems.map((i) => ({
              id: i.id, productName: i.productName, optionLabel: i.optionLabel,
              quantity: i.quantity, subtotal: i.subtotal,
            }))}
          />
        )}
        {isCancellableByCustomer(order.status) && (
          <CancelOrderButton orderNo={order.orderNo} />
        )}
        {canConfirm && (
          <ConfirmPurchaseButton orderNo={order.orderNo} points={formatNumber(locale, order.rewardPoints)} />
        )}
        {showReturnForm && (
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
