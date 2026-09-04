import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSessionUser } from '@shop/auth/session';
import {
  format, won, ORDER_STATUS_LABEL, isCancellableByCustomer, canRequestReturn,
  RETURN_TYPE_LABEL, RETURN_REASON_LABEL, RETURN_STATUS_LABEL,
  type ReturnType, type ReturnReason, type ReturnStatus,
} from '@shop/core';
import { TrackingPanel } from '~/components/tracking-panel';
import { CancelOrderButton } from '~/components/cancel-order-button';
import { ReturnRequestForm } from '~/components/return-request-form';
import { getOrderForUser } from '~/lib/queries/orders';
import { NO_INDEX } from '~/lib/no-index';

export const metadata: Metadata = {
  title: '주문 완료',
  ...NO_INDEX,
};
export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login');

  const order = await getOrderForUser(orderNo, user.id);
  if (!order) notFound();

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
  const headline =
    order.status === 'PENDING'
      ? '주문이 접수되었습니다'
      : order.status === 'CANCELLED' || order.status === 'REFUNDED'
        ? '주문이 종료되었습니다'
        : '주문 내역';

  const NEXT_STEP: Partial<Record<typeof order.status, string>> = {
    PENDING: '결제가 확인되면 배송 준비를 시작합니다.',
    PAID: '곧 배송 준비를 시작합니다.',
    PREPARING: '상품을 준비하고 있습니다. 출고되면 송장번호를 알려 드립니다.',
    SHIPPED: '배송이 시작되었습니다. 아래에서 배송 상황을 조회할 수 있습니다.',
    DELIVERED: '배송이 완료되었습니다. 이상이 없으면 구매를 확정해 주세요.',
    CONFIRMED: '구매가 확정되었습니다.',
  };
  const nextStep = NEXT_STEP[order.status] ?? null;

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
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-n-900 text-2xl text-n-0"
        >
          ✓
        </span>
        <h1 className="font-serif text-2xl font-medium tracking-tight">{headline}</h1>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          현재 상태는 <strong className="font-semibold">{ORDER_STATUS_LABEL[order.status]}</strong>입니다.
          {nextStep && (
            <>
              <br />
              {nextStep}
            </>
          )}
        </p>
        <p className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--surface)] px-3.5">
          <span className="text-xs text-[var(--fg-muted)]">주문번호</span>
          <span className="tnum text-xs font-semibold">{order.orderNo}</span>
        </p>
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
          주문 상품 <span className="tnum text-[var(--fg-muted)]">{order.items.length}</span>
        </h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((i, idx) => (
            <li key={idx} className="flex items-center justify-between gap-3">
              <span className="flex flex-col gap-0.5">
                <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{i.brandName}</span>
                <span className="text-[13px]">{i.productName}</span>
                <span className="text-[11px] text-[var(--fg-muted)]">
                  {i.optionLabel} · <span className="tnum">{i.quantity}</span>개
                </span>
              </span>
              <span className="tnum text-sm font-semibold">{format(won(i.subtotal))}원</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pay-title" className="mt-8 border-t border-[var(--border)] pt-6">
        <h2 id="pay-title" className="mb-3.5 text-sm font-semibold">결제 정보</h2>
        <dl className="flex flex-col gap-2.5">
          {row('상품 금액', `${format(won(order.listTotal))}원`)}
          {order.productDiscount > 0 && row('상품 할인', `-${format(won(order.productDiscount))}원`, true)}
          {order.couponDiscount > 0 && row('쿠폰 할인', `-${format(won(order.couponDiscount))}원`, true)}
          {order.pointsUsed > 0 && row('포인트 사용', `-${format(won(order.pointsUsed))}원`, true)}
          {row('배송비', order.shippingFee === 0 ? '무료' : `${format(won(order.shippingFee))}원`)}
          <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
            <dt className="text-[15px] font-semibold">결제 금액</dt>
            <dd className="tnum text-xl font-semibold">{format(won(order.payable))}원</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-right text-[11px] text-[var(--fg-muted)]">
          구매 확정 시 <span className="tnum">{format(won(order.rewardPoints))}</span>P 적립
        </p>
      </section>

      <section aria-labelledby="ship-title" className="mt-8 border-t border-[var(--border)] pt-6">
        <h2 id="ship-title" className="mb-3.5 text-sm font-semibold">배송지</h2>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {order.recipient} · <span className="tnum">{order.recipientPhone}</span>
          <br />
          {order.address1} {order.address2} <span className="tnum">({order.postalCode})</span>
          {order.deliveryMemo && <><br />요청사항: {order.deliveryMemo}</>}
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
            {RETURN_TYPE_LABEL[activeReturn.type as ReturnType]} 신청
          </h2>
          <dl className="flex flex-col gap-2 text-[13px]">
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">상태</dt>
              <dd className="font-medium">
                {RETURN_STATUS_LABEL[activeReturn.status as ReturnStatus]}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">사유</dt>
              <dd>{RETURN_REASON_LABEL[activeReturn.reason as ReturnReason]}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">반송비</dt>
              <dd>
                {activeReturn.shippingBorneBy === 'CUSTOMER' ? '고객 부담' : '판매자 부담'}
              </dd>
            </div>
            {activeReturn.detail && (
              <div className="flex gap-3">
                <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">설명</dt>
                <dd className="leading-relaxed text-[var(--fg-secondary)]">{activeReturn.detail}</dd>
              </div>
            )}
          </dl>
          {activeReturn.status === 'REJECTED' && activeReturn.rejectReason && (
            <p className="mt-3 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
              반려 사유: {activeReturn.rejectReason}
            </p>
          )}
        </section>
      )}

      <div className="mt-10 flex flex-col gap-3">
        {isCancellableByCustomer(order.status) && (
          <CancelOrderButton orderNo={order.orderNo} />
        )}
        {showReturnForm && <ReturnRequestForm orderNo={order.orderNo} />}
        <div className="flex gap-2">
          <Link
            href="/mypage/orders"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-sm border border-n-300 text-sm font-medium no-underline"
          >
            주문 내역
          </Link>
          <Link
            href="/"
            className="inline-flex h-12 flex-1 items-center justify-center rounded-sm bg-n-900 text-sm font-medium text-n-0 no-underline"
          >
            쇼핑 계속하기
          </Link>
        </div>
      </div>
    </div>
  );
}
