import 'server-only';
import type { MailMessage, MailTemplateKind } from '@shop/core';
import type { Locale } from '@shop/i18n';
import { orderMail } from '~/lib/orders/notify';
import { restockMail, inquiryAnswerMail } from './notices';
import { exchangeShippedMail } from '~/lib/orders/notify-exchange';
import { afterSaleMail } from '~/lib/orders/notify-after-sale';
import { accountMail } from '~/lib/account/notify-account';
import type { MailWording } from './templates';

/**
 * 메일 미리보기 — **실제로 보내는 함수로** 예시 주문·상품을 넣어 만든다.
 *
 * 화면에서 문구를 흉내 내 그리면 실제 메일과 어긋나도 모른다(금액 줄이 제목 아래 어디 붙는지, 이름이 빠지면 무엇이
 * 되는지). 보내는 코드가 만든 그대로를 보여 준다. 받는 주소는 쓰지 않는다 — 보내지 않는다.
 */
export function previewMail(kind: MailTemplateKind, locale: Locale, wording: MailWording): MailMessage {
  const order = {
    to: 'preview@plain.test',
    buyerName: '홍길동',
    orderNo: '20260915-1234567',
    locale,
    items: [{ productName: '울 코트', optionLabel: '오트 / M', quantity: 1, unitPrice: 289_000 }],
    payable: 289_000,
    shipTo: '홍길동 · (04524) 서울 중구 세종대로 110',
  };
  switch (kind) {
    case 'ORDER_PAID':
      return orderMail('paid', order, wording);
    case 'ORDER_PENDING':
      return orderMail('pending', {
        ...order,
        virtualAccount: { bank: '국민은행', accountNumber: '123456-01-234567', dueDate: new Date('2026-09-18T15:00:00Z') },
      }, wording);
    case 'ORDER_DEPOSITED':
      return orderMail('deposited', order, wording);
    case 'RESTOCK':
      return restockMail({ to: order.to, productName: '울 코트', optionLabel: '오트 / M', url: 'https://plain.test/product/wool-coat', locale }, wording);
    case 'INQUIRY_ANSWERED':
      return inquiryAnswerMail({
        to: order.to, productName: '울 코트', question: 'M 사이즈 어깨 너비가 궁금합니다.',
        answer: '어깨 너비는 48cm 입니다.', url: 'https://plain.test/product/wool-coat', locale,
      }, wording);
    case 'EXCHANGE_SHIPPED':
      return exchangeShippedMail({
        to: order.to, name: order.buyerName, orderNo: order.orderNo, locale, carrier: 'CJ', trackingNumber: '123456789012',
        lines: [{ productName: '울 코트', fromOptionLabel: '오트 / M', toOptionLabel: '오트 / L', quantity: 1 }],
      }, wording);
    case 'ORDER_CANCELLED':
    case 'RETURN_APPROVED':
    case 'RETURN_REJECTED':
    case 'REFUND_COMPLETED':
      return afterSaleMail({
        kind, to: order.to, name: order.buyerName, orderNo: order.orderNo, locale,
        items: [{ productName: '울 코트', optionLabel: '오트 / M', quantity: 1 }],
        ...(kind === 'RETURN_REJECTED' ? { reason: '착용 흔적이 있어 반품을 받을 수 없습니다.' } : {}),
        ...(kind === 'RETURN_APPROVED' || kind === 'RETURN_REJECTED' ? { returnType: 'RETURN' as const } : {}),
        ...(kind === 'ORDER_CANCELLED' || kind === 'REFUND_COMPLETED'
          ? { money: { refunded: 289_000, pointsReturned: 1_000, shippingDeducted: 0 } }
          : {}),
      }, wording);
    case 'POINTS_GRANTED':
    case 'POINTS_DEDUCTED':
      return accountMail({
        kind, to: order.to, name: order.buyerName, locale, points: 3_000, balance: 12_500, reason: '배송 지연 보상',
        ...(kind === 'POINTS_GRANTED' ? { expiresAt: new Date('2027-09-15T00:00:00Z') } : {}),
      }, wording);
    case 'ACCOUNT_SUSPENDED':
    case 'ACCOUNT_RESTORED':
      return accountMail({
        kind, to: order.to, name: order.buyerName, locale,
        ...(kind === 'ACCOUNT_SUSPENDED' ? { reason: '결제 도용이 의심되어 확인 중입니다.' } : {}),
      }, wording);
  }
}
