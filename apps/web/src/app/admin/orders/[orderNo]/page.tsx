import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, won, adminStatusActions, hasPermission, ORDER_STATUS_LABEL, canRegisterShipment,
  PAYMENT_STATUS_LABEL, isPaidStatus, canResolveReturnOf, carrierOf, formatTrackingNumber,
  type OrderStatus, type ReturnType, type ReturnReason, type ReturnStatus,
} from '@shop/core';
import { ShipmentForm } from './shipment-form';
import { ReturnActions, CompleteReturnButton, ReceiveReturnButton, ShipExchangeForm } from './return-actions';
import { previewCompleteReturn } from '~/lib/orders/complete-return';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminOrder } from '~/lib/queries/admin/orders';
import { OrderStatusActions } from '~/components/admin/order-status-actions';
import { CancelItemsForm } from '~/components/cancel-items-form';
import { OrderNotes } from '~/components/admin/order-notes';
import { listOrderNotes } from '~/lib/orders/order-notes';
import { getT } from '~/lib/i18n/server';
import { GRADE_KEY, RETURN_TYPE_KEY, RETURN_REASON_KEY, RETURN_STATUS_KEY } from '~/lib/i18n/enum-labels';

export const metadata: Metadata = { title: '주문 상세' };
export const dynamic = 'force-dynamic';

export default async function AdminOrderDetail({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const actor = await requireAdmin('order:read');
  const t = await getT();
  const { orderNo } = await params;
  const order = await getAdminOrder(actor, orderNo);
  if (!order) notFound();
  const notes = await listOrderNotes(actor, order.id);

  /**
   * 송장 입력은 출고 권한이 있을 때만 보여 준다.
   *
   * 이미 배송중·배송완료인 주문에도 보여 준다 — 송장을 잘못 넣는 일은
   * 흔하고, 고칠 방법이 없으면 고객이 남의 택배를 조회하게 된다.
   * 취소·환불된 주문에는 의미가 없으므로 감춘다.
   */
  /*
   * **어떤 상태에 붙일 수 있는지는 core 가 정한다.**
   *
   * 예전에는 여기서 손으로 적은 제외 목록을 들고 있었고, 결제완료와 반품접수를
   * 빠뜨렸다. 결제완료에서 배송중으로 가는 길은 없는데(배송준비를 거쳐야 한다)
   * 단추가 떴고, 누르면 송장만 쓰이고 상태는 그대로였다 — 단추 이름이
   * 거짓말을 했다. 서버도 따로 판단하고 있었고 둘이 달랐다.
   */
  const canFulfill =
    hasPermission(actor, 'order:fulfill') && canRegisterShipment(order.status);

  const activeReturn = order.returnRequests[0] ?? null;

  /*
   * 일부 상품 취소. 돈이 나가는 동작이라 환불 권한이 있어야 하고(가맹점은 없다), 출고 전
   * 상태여야 한다. 서버가 같은 조건으로 다시 막는다.
   */
  const liveItems = order.items.filter((i) => !i.canceledAt);
  const canCancelItems =
    hasPermission(actor, 'order:refund') &&
    (order.status === 'PAID' || order.status === 'PREPARING') &&
    order.payment !== null && isPaidStatus(order.payment.status) &&
    order.payment.method !== 'VIRTUAL_ACCOUNT' &&
    // 남은 줄이 하나여도 세운다 — 부품이 단추를 감추고, 방금 끝난 취소의 안내를 남긴다
    order.items.length >= 2 &&
    liveItems.length >= 1;
  const refundedCash = order.refunds.reduce((sum, r) => sum + r.amount, 0);
  const refundedPoints = order.refunds.reduce((sum, r) => sum + r.points, 0);
  const shippingDeducted = order.refunds.reduce((sum, r) => sum + r.shippingDeducted, 0);
  /*
   * **반품은 둘로 나눈다.** 승인·반려·회수 확인은 물건 곁에 있는 사람(가맹점도)이, 돈을 내보내는
   * 환불은 운영진이 한다. 가맹점은 신청한 줄이 전부 자기 상품일 때만 — 섞였으면 운영진 몫이다.
   */
  const canResolveReturn = canResolveReturnOf(actor, order.returnMerchantIds);
  const canRefundReturn = hasPermission(actor, 'order:refund');
  const mixedReturn =
    activeReturn !== null && hasPermission(actor, 'return:resolve') && !canResolveReturn;

  // 어떤 전이가 가능한지는 상태머신이 정하고, 그중 권한이 있는 것만 보여 준다.
  /*
   * **돌려받을 줄.** 옛 신청(줄을 안 고른)은 반품접수인 줄 전부다.
   */
  const returnLines = activeReturn
    ? order.items.filter((i) =>
        activeReturn.itemIds.length > 0 ? activeReturn.itemIds.includes(i.id) : i.status === 'RETURN_REQUESTED')
    : [];
  const isExchange = activeReturn?.type === 'EXCHANGE';
  const returnPreview =
    activeReturn?.status === 'APPROVED' && canRefundReturn && !isExchange
      ? await previewCompleteReturn(order.orderNo, actor).catch(() => null)
      : null;

  const options = adminStatusActions(order.status).filter((to) => {
    /*
     * 진행 중인 신청이 있으면 반품완료는 **상태 단추로 옮기지 않는다** — 아래 "회수 확인 · 환불" 이
     * 그 일을 한다. 상태 단추는 주문의 줄 전부를 옮기려 해서, 한 줄만 돌려받는 신청에서는 받은
     * 그대로인 줄 때문에 거절되고 사람은 이유를 모른다.
     */
    if (to === 'RETURNED' && activeReturn && activeReturn.status !== 'REJECTED') return false;
    if (to === 'CANCELLED') return hasPermission(actor, 'order:cancel');
    if (to === 'REFUNDED' || to === 'RETURNED') return hasPermission(actor, 'order:refund');
    return hasPermission(actor, 'order:fulfill');
  });

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-center gap-3.5">
          <Link href="/admin/orders" className="text-sm text-[var(--fg-muted)] no-underline">←</Link>
          <h1 className="text-[19px] font-semibold tracking-tight">주문 상세</h1>
          <p className="tnum text-[13px] text-[var(--fg-secondary)]">{order.orderNo}</p>
          <Badge tone="neutral">{ORDER_STATUS_LABEL[order.status]}</Badge>
        </div>
      </header>

      <div className="grid gap-5 p-8 xl:grid-cols-[minmax(0,1fr)_372px]">
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
            <div className="table-scroll" tabIndex={0} role="region" aria-label="주문에 포함된 상품">
              <table className="data-table">
                <caption className="sr-only">주문에 포함된 상품</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">상품</th>
                    <th scope="col" className="w-24 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">단가</th>
                    <th scope="col" className="w-14 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">수량</th>
                    <th scope="col" className="w-28 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">합계</th>
                    <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id} className="border-b border-[var(--surface-2)]">
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
            </div>
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
                {/* 가맹점에게는 등급을 주지 않는다 — 없으면 줄 자체를 두지 않는다 */}
                {order.user.grade && <Row label="등급" value={t(GRADE_KEY[order.user.grade])} />}
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

              {/*
                송장 등록을 배송 정보 바로 아래에 둔다. 주소를 확인하고
                송장을 적는 것이 실제 순서다.
              */}
              {canFulfill && (
                <div className="mt-5 border-t border-[var(--border)] pt-5">
                  <h3 className="mb-3 text-[13px] font-semibold text-[var(--fg)]">송장</h3>
                  <ShipmentForm orderNo={order.orderNo} current={order.shipment} />
                </div>
              )}
            </section>
          </div>

          {activeReturn && (
            <section
              aria-labelledby="return-title"
              className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
            >
              <div className="mb-4 flex items-baseline justify-between gap-4">
                <h2 id="return-title" className="text-base font-semibold">
                  {t(RETURN_TYPE_KEY[activeReturn.type as ReturnType])} 신청
                </h2>
                <span className="text-xs text-[var(--fg-muted)]">
                  {t(RETURN_STATUS_KEY[activeReturn.status as ReturnStatus])}
                </span>
              </div>
              <dl className="flex flex-col">
                {isExchange ? (
                  <Row
                    label="교환할 상품"
                    value={
                      activeReturn.exchangeLines
                        .map((l) => {
                          const item = order.items.find((i) => i.id === l.orderItemId);
                          return `${item?.productName ?? ''} (${l.fromOptionLabel} → ${l.toOptionLabel}) × ${l.quantity}`;
                        })
                        .join(', ') || '—'
                    }
                  />
                ) : (
                  <Row
                    label="돌려받을 상품"
                    value={returnLines.map((i) => `${i.productName} (${i.optionLabel}) × ${i.quantity}`).join(', ') || '—'}
                  />
                )}
                <Row label="사유" value={t(RETURN_REASON_KEY[activeReturn.reason as ReturnReason])} />
                <Row
                  label="반송비"
                  value={activeReturn.shippingBorneBy === 'CUSTOMER' ? '고객 부담' : '판매자 부담'}
                />
                <Row
                  label="신청일"
                  value={activeReturn.requestedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                />
                {activeReturn.detail && <Row label="상세" value={activeReturn.detail} />}
                {activeReturn.rejectReason && (
                  <Row label="반려 사유" value={activeReturn.rejectReason} />
                )}
                {activeReturn.status === 'APPROVED' || activeReturn.status === 'COMPLETED' ? (
                  <Row
                    label="회수 확인"
                    value={
                      activeReturn.receivedAt
                        ? activeReturn.receivedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
                        : '아직 — 물건이 도착하면 확인합니다'
                    }
                  />
                ) : null}
                {activeReturn.reshipTrackingNumber && (
                  <Row
                    label="교환 송장"
                    value={`${carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier ?? ''} ${formatTrackingNumber(activeReturn.reshipTrackingNumber)}`}
                  />
                )}
              </dl>

              {mixedReturn && (
                <p className="mt-4 rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--fg-secondary)]">
                  다른 가맹점 상품이 함께 신청된 반품이라 운영진이 처리합니다.
                </p>
              )}

              {/*
                아직 처리 안 된 신청에만 버튼을 둔다. 이미 승인·반려한 것에
                다시 버튼이 보이면 두 번 누르게 된다.
              */}
              {activeReturn.status === 'REQUESTED' && canResolveReturn && (
                <ReturnActions orderNo={order.orderNo} exchange={isExchange} />
              )}
              {/* 교환은 돈이 안 움직여 반품 처리 권한으로 끝까지 한다 — 환불 단추 대신 교환 상품 발송 */}
              {isExchange && activeReturn.status === 'APPROVED' && canResolveReturn && (
                <ShipExchangeForm orderNo={order.orderNo} />
              )}
              {/* 물건이 도착하면 확인한다 — 가맹점이 누르고, 운영진은 이 기록을 보고 환불한다 */}
              {!isExchange && activeReturn.status === 'APPROVED' && !activeReturn.receivedAt && canResolveReturn && !canRefundReturn && (
                <ReceiveReturnButton orderNo={order.orderNo} />
              )}
              {/* 돈을 내보내는 것은 운영진이다. 금액은 서버가 미리 센 값이다 */}
              {!isExchange && activeReturn.status === 'APPROVED' && canRefundReturn && (
                <CompleteReturnButton
                  orderNo={order.orderNo}
                  preview={returnPreview}
                  received={activeReturn.receivedAt !== null}
                />
              )}
            </section>
          )}

          <section
            aria-labelledby="note-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="note-title" className="mb-4 text-base font-semibold">
              내부 메모
              {notes.length > 0 && <span className="tnum ml-1.5 text-[13px] font-normal text-[var(--fg-muted)]">{notes.length}</span>}
            </h2>
            <OrderNotes
              orderNo={order.orderNo}
              audience={actor.merchantId ? 'merchant' : 'staff'}
              notes={notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }))}
            />
          </section>

          <section
            aria-labelledby="log-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="log-title" className="mb-4 text-base font-semibold">처리 이력</h2>
            <div className="table-scroll" tabIndex={0} role="region" aria-label="주문 상태 변경 이력">
              <table className="data-table">
                <caption className="sr-only">주문 상태 변경 이력</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="w-40 pb-2.5 text-left text-xs text-[var(--fg-secondary)]">일시</th>
                    <th scope="col" className="w-32 pb-2.5 text-left text-xs text-[var(--fg-secondary)]">처리자</th>
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">내용</th>
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
            </div>
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
                  {refundedCash > 0 && <Amount label="환불한 금액" value={won(refundedCash)} negative />}
                  {refundedPoints > 0 && <Amount label="돌려준 포인트" value={won(refundedPoints)} />}
                  {shippingDeducted > 0 && <Amount label="일부 취소로 뗀 배송비" value={won(shippingDeducted)} />}
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
            {canCancelItems && (
              <div className="mt-4 border-t border-[var(--surface-2)] pt-4">
                <CancelItemsForm
                  orderNo={order.orderNo}
                  items={liveItems.map((i) => ({
                    id: i.id, productName: i.productName, optionLabel: i.optionLabel,
                    quantity: i.quantity, subtotal: i.subtotal,
                  }))}
                />
              </div>
            )}
          </section>
        </div>
      </div>
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
