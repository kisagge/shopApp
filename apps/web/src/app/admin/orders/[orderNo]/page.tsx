import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, won, nextStatuses, hasPermission, ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL, MEMBER_GRADE_LABEL,
  type OrderStatus,
} from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminOrder } from '~/lib/queries/admin';
import { OrderStatusActions } from '~/components/admin/order-status-actions';

export const metadata: Metadata = { title: '주문 상세' };
export const dynamic = 'force-dynamic';

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const actor = await requireAdmin('order:read');
  const { orderNo } = await params;
  const order = await getAdminOrder(actor, orderNo);
  if (!order) notFound();

  // 어떤 전이가 가능한지는 상태머신이 정하고, 그중 권한이 있는 것만 보여 준다.
  const options = nextStatuses(order.status).filter((to) => {
    if (to === 'CANCELLED') return hasPermission(actor, 'order:cancel');
    if (to === 'REFUNDED' || to === 'RETURNED') return hasPermission(actor, 'order:refund');
    return hasPermission(actor, 'order:fulfill');
  });

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-center gap-3.5">
          <Link href="/admin/orders" className="text-sm text-[var(--fg-muted)] no-underline">←</Link>
          <h1 className="text-[19px] font-semibold tracking-tight">주문 상세</h1>
          <p className="tnum text-[13px] text-[var(--fg-secondary)]">{order.orderNo}</p>
          <Badge tone="neutral">{ORDER_STATUS_LABEL[order.status]}</Badge>
        </div>
      </header>

      <main className="grid gap-5 p-8 xl:grid-cols-[minmax(0,1fr)_372px]">
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="items-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-4 flex items-baseline gap-2">
              <h2 id="items-title" className="text-base font-semibold">주문 상품</h2>
              <span className="tnum text-[13px] text-[var(--fg-muted)]">{order.items.length}</span>
              {order.isScoped && (
                <span className="text-xs text-[var(--fg-muted)]">— 내 가맹점 상품만</span>
              )}
            </div>
            <table>
              <caption className="sr-only">주문에 포함된 상품</caption>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="pb-2.5 text-xs text-[var(--fg-secondary)]">상품</th>
                  <th scope="col" className="w-24 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">단가</th>
                  <th scope="col" className="w-14 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">수량</th>
                  <th scope="col" className="w-28 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">합계</th>
                  <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i, idx) => (
                  <tr key={idx} className="border-b border-[var(--surface-2)]">
                    <td className="py-3.5">
                      <span className="block text-[13px]">{i.productName}</span>
                      <span className="block text-[11px] text-[var(--fg-muted)]">
                        {i.brandName} · {i.optionLabel}
                      </span>
                    </td>
                    <td className="tnum py-3.5 text-right text-[13px]">{format(won(i.unitPrice))}</td>
                    <td className="tnum py-3.5 text-right text-[13px]">{i.quantity}</td>
                    <td className="tnum py-3.5 text-right text-[13px] font-semibold">
                      {format(won(i.subtotal))}
                    </td>
                    <td className="py-3.5 text-center">
                      <Badge tone="neutral">{ORDER_STATUS_LABEL[i.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section
              aria-labelledby="buyer-title"
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
            >
              <h2 id="buyer-title" className="mb-4 text-base font-semibold">주문자</h2>
              <dl className="flex flex-col">
                <Row label="이름" value={order.user.name} />
                {/* 가맹점에게는 이메일을 주지 않는다. 배송에 필요한 정보가 아니다. */}
                {order.user.email && <Row label="이메일" value={order.user.email} />}
                <Row label="등급" value={MEMBER_GRADE_LABEL[order.user.grade]} />
              </dl>
            </section>

            <section
              aria-labelledby="ship-title"
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
            >
              <h2 id="ship-title" className="mb-4 text-base font-semibold">배송 정보</h2>
              <dl className="flex flex-col">
                <Row label="받는 분" value={order.recipient} />
                <Row label="연락처" value={order.recipientPhone} />
                <Row
                  label="주소"
                  value={`${order.address1} ${order.address2 ?? ''} (${order.postalCode})`}
                />
                {order.deliveryMemo && <Row label="요청사항" value={order.deliveryMemo} />}
              </dl>
            </section>
          </div>

          <section
            aria-labelledby="log-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="log-title" className="mb-4 text-base font-semibold">처리 이력</h2>
            <table>
              <caption className="sr-only">주문 상태 변경 이력</caption>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="w-40 pb-2.5 text-xs text-[var(--fg-secondary)]">일시</th>
                  <th scope="col" className="w-32 pb-2.5 text-xs text-[var(--fg-secondary)]">처리자</th>
                  <th scope="col" className="pb-2.5 text-xs text-[var(--fg-secondary)]">내용</th>
                </tr>
              </thead>
              <tbody>
                {order.statusLogs.map((l, idx) => (
                  <tr key={idx} className="border-b border-[var(--surface-2)]">
                    <td className="tnum py-2.5 text-xs text-[var(--fg-secondary)]">
                      {l.createdAt.toLocaleString('ko-KR')}
                    </td>
                    <td className="py-2.5 text-xs">
                      {l.actor === 'system' ? '시스템' : `${l.actor.slice(0, 8)}…`}
                    </td>
                    <td className="py-2.5 text-xs">
                      {l.from === l.to
                        ? l.note
                        : `${l.from ? ORDER_STATUS_LABEL[l.from] : '신규'} → ${ORDER_STATUS_LABEL[l.to]}${l.note ? ` (${l.note})` : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="pay-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="pay-title" className="mb-4 text-base font-semibold">
              {order.isScoped ? '내 가맹점 정산 기준' : '결제 정보'}
            </h2>
            {order.isScoped ? (
              <dl className="flex items-baseline justify-between">
                <dt className="text-sm font-semibold">내 상품 합계</dt>
                <dd className="tnum text-xl font-semibold">{format(order.scopedTotal)}원</dd>
              </dl>
            ) : (
              <>
                <dl className="flex flex-col gap-2.5">
                  <Amount label="상품 금액" value={won(order.listTotal)} />
                  {order.productDiscount > 0 && <Amount label="상품 할인" value={won(order.productDiscount)} negative />}
                  {order.couponDiscount > 0 && <Amount label="쿠폰 할인" value={won(order.couponDiscount)} negative />}
                  {order.pointsUsed > 0 && <Amount label="포인트 사용" value={won(order.pointsUsed)} negative />}
                  <Amount label="배송비" value={won(order.shippingFee)} />
                  <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
                    <dt className="text-sm font-semibold">결제 금액</dt>
                    <dd className="tnum text-xl font-semibold">{format(won(order.payable))}원</dd>
                  </div>
                </dl>
                {order.payment && (
                  <dl className="mt-4 flex flex-col gap-2 border-t border-[var(--surface-2)] pt-3.5">
                    <Row label="결제 수단" value={order.payment.method} small />
                    <Row
                      label="결제 상태"
                      value={PAYMENT_STATUS_LABEL[order.payment.status] ?? order.payment.status}
                      small
                    />
                    {order.payment.pgApprovalNo && (
                      <Row label="승인 번호" value={order.payment.pgApprovalNo} small />
                    )}
                  </dl>
                )}
              </>
            )}
          </section>

          <section
            aria-labelledby="action-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="action-title" className="mb-1 text-base font-semibold">주문 처리</h2>
            <p className="mb-4 text-xs leading-relaxed text-[var(--fg-muted)]">
              {order.isScoped
                ? '내 가맹점 상품만 처리됩니다. 다른 가맹점 상품이 남아 있으면 주문 전체 상태는 그대로입니다.'
                : '가능한 전이는 주문 상태머신이 정합니다.'}
            </p>
            <OrderStatusActions orderNo={order.orderNo} options={options} />
          </section>
        </div>
      </main>
    </>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={`flex gap-3.5 ${small ? '' : 'border-t border-[var(--surface-2)] py-2.5 first:border-0'}`}>
      <dt className="w-20 shrink-0 text-xs text-[var(--fg-muted)]">{label}</dt>
      <dd className="text-[13px] leading-relaxed">{value}</dd>
    </div>
  );
}

function Amount({ label, value, negative }: { label: string; value: number; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${negative ? 'text-accent' : ''}`}>
        {negative ? '−' : ''}
        {format(won(value))}원
      </dd>
    </div>
  );
}

// 사용하지 않지만 타입 참조를 유지한다
export type { OrderStatus };
