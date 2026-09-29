import { notFound, redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  isReturnableLine, isReceiptIssuable, receiptTotals, orderView,
  type OrderHeadline, type ReturnDestination, type ReturnStatus,
} from '@shop/core';
import { TrackingPanel } from '~/components/tracking-panel';
import { CancelOrderButton } from '~/components/cancel-order-button';
import { CancelItemsForm } from '~/components/cancel-items-form';
import { RepayButton } from '~/components/repay-button';
import { LateDepositNotice } from '~/components/late-deposit-notice';
import { ReorderButton } from '~/components/reorder-button';
import { ConfirmPurchaseButton } from '~/components/confirm-purchase-button';
import { serverPaymentMode } from '~/lib/payments';
import { getShippingPolicy } from '~/lib/shipping-policy';
import { orderNameOf } from '~/lib/checkout/pay-order';
import { ReturnRequestForm } from '~/components/return-request-form';
import { OrderAddressEdit } from '~/components/order-address-edit';
import { OrderLines } from './order-lines';
import { ReturnPanel } from './return-panel';
import { approvedReturnDestinations } from '~/lib/orders/return-address';
import { getOrderForUser, getExchangeOptions, getDisplayedProductSlugs, type ExchangeOption } from '~/lib/queries/orders';
import { NO_INDEX } from '~/lib/no-index';
import { formatMoney, formatNumber, formatDateTime, type MessageKey } from '@shop/i18n';
import { getLocale, getT } from '~/lib/i18n/server';
import { ORDER_STATUS_KEY } from '~/lib/i18n/enum-labels';

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

  const [order, locale, t, query, shipping] = await Promise.all([
    getOrderForUser(orderNo, user.id),
    getLocale(),
    getT(),
    searchParams,
    // 배송지를 고칠 때 도서산간 추가 배송비를 화면이 미리 말해 준다 — 결제 직전에 처음 보면 놀란다
    getShippingPolicy(),
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

      <OrderLines
        items={order.items}
        orderStatus={order.status}
        productSlugs={productSlugs}
        exchanging={activeReturn?.type === 'EXCHANGE'}
      />

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
        {/*
          **고칠 길을 여기 둔다.** 출고 전까지만이다(core 의 checkAddressEdit) — 송장이 나간 뒤에는 물건이
          이미 옛 주소로 가고 있어서, 주문에 적힌 주소만 바꾸면 화면과 현실이 갈린다. 없던 때에는 상세주소를
          잘못 적으면 취소하고 다시 사거나 1:1 문의로 부탁해야 했고, 운영자도 화면에서 못 고쳐 DB 를 만졌다.
        */}
        {view.canEditAddress && (
          <OrderAddressEdit
            orderNo={order.orderNo}
            remoteSurcharge={shipping.remoteSurcharge}
            current={{
              recipient: order.recipient,
              phone: order.recipientPhone,
              postalCode: order.postalCode,
              address1: order.address1,
              address2: order.address2,
              memo: order.deliveryMemo,
            }}
          />
        )}
      </section>

      <ReturnPanel
        orderNo={order.orderNo}
        items={order.items}
        activeReturn={activeReturn}
        returnTo={returnTo}
        canCancelReturn={view.canCancelReturn}
      />

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
