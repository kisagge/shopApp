import 'server-only';
import { prisma } from '@shop/db';
import {
  carrierOf, formatTrackingNumber, mailButton, mailLead, mailRow, mailShell, trackingUrlFor,
  type MailMessage,
} from '@shop/core';
import type { Locale } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { localeOf } from '~/lib/mail/recipient';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from '~/lib/notifications/deliver';
import { absoluteUrl } from '~/lib/urls';

/**
 * 출고·도착 알림.
 *
 * **이 둘만 메일이 안 나갔다.** 주문접수·입금·취소·환불·반품 판정·문의 답변, 심지어 **교환 상품 발송**까지
 * 메일이 가는데, 정작 "보냈습니다 / 도착했습니다" 는 알림함에만 남았다. 알림함을 만든 이유가 "메일은 스팸함으로
 * 가기도 한다" 인데(deliver 의 주석), 여기서는 거꾸로 알림함 하나뿐이라 **다시 들어오지 않으면 배송이 시작된
 * 줄을 모른다.** 사는 사람이 가장 기다리는 소식이 그것이다.
 *
 * 운영이 문구를 고칠 수 있는 것도 같다 — 다른 메일은 다 되는데 이 둘만 안 되는 이유가 없다.
 */

export interface OrderShippedMailInput {
  readonly to: string;
  readonly name: string;
  readonly orderNo: string;
  readonly locale: Locale;
  /** 송장이 없으면 조회 자리를 통째로 뺀다 — 빈 칸은 "번호가 사라졌다" 로 읽힌다 */
  readonly shipment: { readonly carrier: string; readonly trackingNumber: string } | null;
}

/**
 * 보냈다는 메일. **송장을 적는다** — 알림을 받고 가장 먼저 하는 일이 배송 조회다.
 *
 * 조회 주소는 택배사 사정으로 바뀔 수 있어 번호를 늘 함께 적는다(교환 발송 메일과 같은 판단).
 */
export function orderShippedMail(input: OrderShippedMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const lead = wordOf(t, wording, 'lead', 'mail.shipped.lead', { name: input.name });
  const orderUrl = absoluteUrl(`/order/${input.orderNo}`);

  const carrierName = input.shipment ? carrierOf(input.shipment.carrier)?.name ?? input.shipment.carrier : null;
  const tracking = input.shipment ? formatTrackingNumber(input.shipment.trackingNumber) : null;
  const trackUrl = input.shipment ? trackingUrlFor(input.shipment.carrier, input.shipment.trackingNumber) : null;

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', 'mail.shipped.subject', { orderNo: input.orderNo }),
    text: [
      lead,
      '',
      `${t('mail.order.orderNo')} ${input.orderNo}`,
      ...(carrierName && tracking ? [`${t('mail.shipped.shipment')} ${carrierName} ${tracking}`] : []),
      ...(trackUrl ? [trackUrl] : []),
      '',
      orderUrl,
    ].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', 'mail.shipped.heading'),
      bodyHtml: [
        mailLead(lead),
        mailRow(t('mail.order.orderNo'), input.orderNo),
        ...(carrierName && tracking ? [mailRow(t('mail.shipped.shipment'), `${carrierName} ${tracking}`)] : []),
        ...(trackUrl ? [mailButton(trackUrl, t('mail.shipped.track'))] : []),
        mailButton(orderUrl, t('mail.order.view')),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

export interface OrderDeliveredMailInput {
  readonly to: string;
  readonly name: string;
  readonly orderNo: string;
  readonly locale: Locale;
}

/**
 * 도착했다는 메일.
 *
 * **여기서부터 시계가 돈다.** 반품·교환 기한도, 자동 구매확정도 배송완료일부터 센다. 그 시작을 알리지 않으면
 * 손님은 기한이 언제 끝나는지 모른 채 지나간다. 신청하는 자리는 주문 화면이라 그리로 보낸다.
 */
export function orderDeliveredMail(input: OrderDeliveredMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const lead = wordOf(t, wording, 'lead', 'mail.delivered.lead', { name: input.name });
  const orderUrl = absoluteUrl(`/order/${input.orderNo}`);

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', 'mail.delivered.subject', { orderNo: input.orderNo }),
    text: [lead, '', `${t('mail.order.orderNo')} ${input.orderNo}`, '', orderUrl].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', 'mail.delivered.heading'),
      bodyHtml: [
        mailLead(lead),
        mailRow(t('mail.order.orderNo'), input.orderNo),
        mailButton(orderUrl, t('mail.order.view')),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

/**
 * 출고·도착을 알린다 — 메일 한 통과 알림함 한 줄.
 *
 * **던지지 않는다.** 부르는 자리에서 본 일(상태 변경)은 이미 끝났다. 알림이 실패했다고 사람이 한 처리를
 * 무를 수는 없다(다른 알림들과 같은 판단).
 *
 * 탈퇴한 계정에는 보내지 않는다 — 주소가 지워졌다.
 */
export async function notifyShipmentStage(input: {
  readonly orderNo: string;
  readonly userId: string;
  readonly stage: 'SHIPPED' | 'DELIVERED';
}): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true, name: true, locale: true, deletedAt: true },
    });
    if (!user || user.deletedAt) return;

    const locale = localeOf(user.locale);
    /*
     * 송장은 있을 때만 싣는다. 칸이 비어 있는 줄(옛 주문이나 번호 없이 만든 줄)이면 조회 자리를 통째로 뺀다 —
     * 빈 칸이 늘어선 덩이는 "번호가 사라졌다" 로 읽힌다(입금 안내와 같은 판단).
     */
    const row =
      input.stage === 'SHIPPED'
        ? await prisma.shipment.findFirst({
            where: { order: { orderNo: input.orderNo } },
            select: { carrier: true, trackingNumber: true },
          })
        : null;
    const shipment =
      row && row.carrier && row.trackingNumber
        ? { carrier: row.carrier, trackingNumber: row.trackingNumber }
        : null;

    await deliverNotice({
      tag: 'shipment',
      ref: input.orderNo,
      mail: {
        template: input.stage === 'SHIPPED' ? 'ORDER_SHIPPED' : 'ORDER_DELIVERED',
        locale,
        build: (wording) =>
          input.stage === 'SHIPPED'
            ? orderShippedMail({ to: user.email, name: user.name, orderNo: input.orderNo, locale, shipment }, wording)
            : orderDeliveredMail({ to: user.email, name: user.name, orderNo: input.orderNo, locale }, wording),
      },
      notification: {
        userId: input.userId,
        kind: input.stage === 'SHIPPED' ? 'ORDER_SHIPPED' : 'ORDER_DELIVERED',
        params: { orderNo: input.orderNo },
        linkPath: `/order/${input.orderNo}`,
      },
    });
  } catch (error) {
    console.error('[shipment] 배송 알림 실패', input.orderNo, error);
  }
}
