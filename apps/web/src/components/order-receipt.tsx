import { receiptTotals, type ReceiptRefund } from '@shop/core';
import type { PaymentMethodInput } from '@shop/contract';
import { formatDateTime, formatMoney, formatNumber, type Locale, type Translator } from '@shop/i18n';
import { PAY_METHOD_KEY } from '~/lib/i18n/pay-method-key';

export interface ReceiptLine {
  readonly id: string;
  readonly productName: string;
  readonly brandName: string;
  readonly optionLabel: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly subtotal: number;
  readonly canceledAt: Date | null;
  readonly status: string;
}

export interface ReceiptOrder {
  readonly orderNo: string;
  readonly status: string;
  readonly placedAt: Date;
  readonly paidAt: Date;
  readonly listTotal: number;
  readonly productDiscount: number;
  readonly couponDiscount: number;
  readonly pointsUsed: number;
  readonly shippingFee: number;
  readonly payable: number;
  readonly payment: { readonly method: PaymentMethodInput } | null;
  readonly refunds: readonly ReceiptRefund[];
  readonly items: readonly ReceiptLine[];
}

/**
 * 주문 영수증.
 *
 * **종이에 찍혀도 읽혀야 한다.** 그래서 색으로 말하는 것이 없다 — 취소된 줄은 흐리게가 아니라 글자로 적고,
 * 할인은 빨간색이 아니라 빼기 부호로 적는다. 흑백 프린터에서 색은 사라진다.
 *
 * 상품 사진도 없다. 인쇄하면 잉크만 먹고, 경비 처리하는 사람이 보는 것은 이름·수량·금액이다.
 *
 * 화면과 인쇄가 같은 마크업이다 — 인쇄에서만 숨길 것(단추·머리·발)은 `print:hidden` 으로 뺀다. 따로 그리면
 * 화면에서 본 것과 종이에 찍힌 것이 갈린다.
 */
export function OrderReceipt({
  order,
  locale,
  t,
  issuedAt,
}: {
  order: ReceiptOrder;
  locale: Locale;
  t: Translator;
  /** 발행 시각. 테스트가 고정할 수 있게 받는다 */
  issuedAt: Date;
}) {
  const money = (amount: number) => formatMoney(locale, amount);
  const totals = receiptTotals(order.payable, order.refunds);

  const lineNote = (line: ReceiptLine): string | null => {
    if (line.status === 'RETURN_REQUESTED') return t('order.lineReturning');
    if (!line.canceledAt) return null;
    // 주문째 환불이면 줄마다 "반품 환불" 을 붙이지 않는다 — 주문 상태가 이미 말한다
    return line.status === 'REFUNDED' && order.status !== 'REFUNDED' ? t('order.lineRefunded') : t('order.lineCanceled');
  };

  const meta: [string, string, Date | null][] = [
    [t('order.number'), order.orderNo, null],
    [t('receipt.orderedAt'), formatDateTime(locale, order.placedAt), order.placedAt],
    [t('receipt.paidAt'), formatDateTime(locale, order.paidAt), order.paidAt],
    [t('checkout.method'), order.payment ? t(PAY_METHOD_KEY[order.payment.method]) : '—', null],
    [t('receipt.issuedAt'), formatDateTime(locale, issuedAt), issuedAt],
  ];

  return (
    <article aria-labelledby="receipt-title" className="flex flex-col gap-8 text-[var(--fg)]">
      <header className="flex flex-col gap-1 border-b-2 border-[var(--fg)] pb-4">
        {/* 상호는 번역하지 않는다 — 이름이다 */}
        <p className="font-serif text-lg tracking-[0.2em]" lang="en">PLAIN</p>
        <h1 id="receipt-title" className="text-2xl font-semibold tracking-tight">{t('receipt.title')}</h1>
      </header>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
        {meta.map(([label, value, date]) => (
          <div key={label} className="contents">
            <dt className="text-[var(--fg-secondary)]">{label}</dt>
            <dd className="tnum">
              {date ? <time dateTime={date.toISOString()}>{value}</time> : value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="table-scroll" tabIndex={0} role="region" aria-label={t('receipt.items')}>
        <table className="w-full border-collapse text-[13px]">
          <caption className="mb-2 text-left text-sm font-semibold">{t('receipt.items')}</caption>
          <thead>
            <tr className="border-y border-[var(--fg)]">
              <th scope="col" className="py-2 pr-3 text-left font-medium">{t('receipt.colProduct')}</th>
              <th scope="col" className="w-14 px-2 py-2 text-right font-medium">{t('receipt.colQty')}</th>
              <th scope="col" className="w-24 px-2 py-2 text-right font-medium">{t('receipt.colUnit')}</th>
              <th scope="col" className="w-28 py-2 pl-2 text-right font-medium">{t('receipt.colAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((line) => {
              const note = lineNote(line);
              return (
                <tr key={line.id} className="border-b border-[var(--border)] align-top">
                  <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                    <span className="block text-[11px] text-[var(--fg-secondary)]">{line.brandName}</span>
                    <span className="block">
                      {line.productName}
                      {note && <span className="ml-1.5 text-[11px] text-[var(--fg-secondary)]">({note})</span>}
                    </span>
                    <span className="block text-[11px] text-[var(--fg-secondary)]">{line.optionLabel}</span>
                  </th>
                  <td className="tnum px-2 py-2.5 text-right">{formatNumber(locale, line.quantity)}</td>
                  <td className="tnum px-2 py-2.5 text-right">{money(line.unitPrice)}</td>
                  <td className="tnum py-2.5 pl-2 text-right">{money(line.subtotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <dl aria-label={t('order.payInfo')} className="ml-auto flex w-full max-w-[320px] flex-col gap-1.5 text-[13px]">
        <Row label={t('cart.subtotal')} value={money(order.listTotal)} />
        {order.productDiscount > 0 && <Row label={t('cart.productDiscount')} value={`-${money(order.productDiscount)}`} />}
        {order.couponDiscount > 0 && <Row label={t('cart.couponDiscount')} value={`-${money(order.couponDiscount)}`} />}
        {order.pointsUsed > 0 && <Row label={t('cart.pointsUsed')} value={`-${money(order.pointsUsed)}`} />}
        <Row
          label={t('cart.shippingFee')}
          value={order.shippingFee === 0 ? t('cart.freeShipping') : money(order.shippingFee)}
        />
        <Row label={t('order.payable')} value={money(totals.paid)} strong />
        {totals.refundedCash > 0 && <Row label={t('order.refundedCash')} value={`-${money(totals.refundedCash)}`} />}
        {totals.refundedPoints > 0 && (
          <Row label={t('order.refundedPoints')} value={`${formatNumber(locale, totals.refundedPoints)}P`} />
        )}
        {totals.shippingDeducted > 0 && <Row label={t('order.shippingDeducted')} value={money(totals.shippingDeducted)} />}
        {/* 돌려준 돈이 있을 때만 — 없으면 결제 금액과 같은 줄이 한 번 더 찍힌다 */}
        {totals.refundedCash > 0 && <Row label={t('receipt.net')} value={money(totals.net)} strong />}
      </dl>

      <p className="border-t border-[var(--border)] pt-3 text-[11px] leading-relaxed text-[var(--fg-secondary)]">
        {t('receipt.note')}
      </p>
    </article>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        strong ? 'mt-1 border-t border-[var(--fg)] pt-2 text-[15px] font-semibold' : ''
      }`}
    >
      <dt className={strong ? '' : 'text-[var(--fg-secondary)]'}>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
