import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSessionUser } from '@shop/auth/session';
import { format, won, ORDER_STATUS_LABEL, isCancellableByCustomer, type OrderStatus } from '@shop/core';
import { CancelOrderButton } from '~/components/cancel-order-button';
import { getOrderForUser } from '~/lib/queries/orders';

export const metadata: Metadata = { title: '주문 완료' };
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

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 md:px-10">
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-n-900 text-2xl text-n-0"
        >
          ✓
        </span>
        <h1 className="font-serif text-2xl font-medium tracking-tight">주문이 접수되었습니다</h1>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          현재 상태는 <strong className="font-semibold">{ORDER_STATUS_LABEL[order.status as OrderStatus]}</strong>입니다.
          <br />
          결제가 확인되면 배송 준비를 시작합니다.
        </p>
        <p className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--surface)] px-3.5">
          <span className="text-xs text-[var(--fg-muted)]">주문번호</span>
          <span className="tnum text-xs font-semibold">{order.orderNo}</span>
        </p>
      </div>

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

      <div className="mt-10 flex flex-col gap-3">
        {isCancellableByCustomer(order.status as OrderStatus) && (
          <CancelOrderButton orderNo={order.orderNo} />
        )}
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
