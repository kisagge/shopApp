import 'server-only';
import { prisma } from '@shop/db';
import {
  carrierOf, formatTrackingNumber, mailButton, mailLead, mailList, mailRow, mailSectionLabel, mailShell, trackingUrlFor,
  type MailMessage,
} from '@shop/core';
import type { Locale } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { localeOf } from '~/lib/mail/recipient';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from '~/lib/notifications/deliver';
import { absoluteUrl } from '~/lib/urls';

export interface ExchangeShippedLine {
  readonly productName: string;
  readonly fromOptionLabel: string;
  readonly toOptionLabel: string;
  readonly quantity: number;
}

export interface ExchangeShippedMailInput {
  readonly to: string;
  readonly name: string;
  readonly orderNo: string;
  readonly locale: Locale;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly lines: readonly ExchangeShippedLine[];
}

/**
 * 교환 상품을 보냈다는 메일.
 *
 * **무엇이 무엇으로 바뀌어 가는지 적는다.** "교환 상품을 보냈습니다" 만 오면 여러 줄을 바꾼 사람은 어느 것이 오는지
 * 모른다. 그리고 **송장을 적는다** — 알림을 받고 가장 먼저 하는 일이 배송 조회다. 조회 주소는 택배사 사정으로 바뀔 수
 * 있어 번호를 늘 함께 적는다(carrier 의 주석과 같은 이유).
 *
 * 고칠 수 있는 칸은 다른 메일과 같이 제목·머리말·첫 문장뿐이다. 상품 줄과 송장은 코드가 그린다.
 */
export function exchangeShippedMail(input: ExchangeShippedMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const lead = wordOf(t, wording, 'lead', 'mail.exchange.lead', { name: input.name });
  const carrierName = carrierOf(input.carrier)?.name ?? input.carrier;
  const tracking = formatTrackingNumber(input.trackingNumber);
  const trackUrl = trackingUrlFor(input.carrier, input.trackingNumber);
  const orderUrl = absoluteUrl(`/order/${input.orderNo}`);

  const lineText = (l: ExchangeShippedLine) =>
    `${l.productName}: ${l.fromOptionLabel} → ${l.toOptionLabel} · ${t('mail.order.quantity', { count: l.quantity })}`;

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', 'mail.exchange.subject', { orderNo: input.orderNo }),
    text: [
      lead,
      '',
      `${t('mail.order.orderNo')} ${input.orderNo}`,
      `${t('mail.exchange.shipment')} ${carrierName} ${tracking}`,
      ...(trackUrl ? [trackUrl] : []),
      '',
      t('mail.exchange.items'),
      ...input.lines.map((l) => `- ${lineText(l)}`),
      '',
      orderUrl,
    ].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', 'mail.exchange.heading'),
      bodyHtml: [
        mailLead(lead),
        mailRow(t('mail.order.orderNo'), input.orderNo),
        mailRow(t('mail.exchange.shipment'), `${carrierName} ${tracking}`),
        mailSectionLabel(t('mail.exchange.items')),
        mailList(input.lines.map(lineText)),
        // 조회 주소가 없는 택배사(기타)면 주문 화면으로 — 거기에 송장이 적혀 있다
        trackUrl ? mailButton(trackUrl, t('mail.exchange.track')) : mailButton(orderUrl, t('mail.order.view')),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

/**
 * 교환 상품 발송을 손님에게 알린다 — 알림함과 메일.
 *
 * **교환 처리를 끝낸 뒤 트랜잭션 밖에서 부른다. 실패해도 던지지 않는다.** 재고와 주문 줄은 이미 바뀌었고 송장도
 * 적혔다 — 메일이 안 나갔다고 발송을 무를 수 없다(주문 안내·재입고와 같은 판단).
 *
 * 받는 사람의 말로 쓴다 — 처리한 운영자의 말이 아니다. 탈퇴한 계정에는 보내지 않는다(주소가 지워졌다).
 */
export async function notifyExchangeShipped(input: {
  readonly orderNo: string;
  readonly userId: string;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly lines: readonly { readonly orderItemId: string; readonly fromOptionLabel: string; readonly toOptionLabel: string; readonly quantity: number }[];
}): Promise<void> {
  try {
    const [user, items] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.userId },
        select: { email: true, name: true, locale: true, deletedAt: true },
      }),
      prisma.orderItem.findMany({
        where: { id: { in: input.lines.map((l) => l.orderItemId) } },
        select: { id: true, productName: true },
      }),
    ]);
    if (!user || user.deletedAt) return;

    const nameOf = new Map(items.map((i) => [i.id, i.productName]));
    const locale = localeOf(user.locale);

    await deliverNotice({
      tag: 'exchange',
      ref: input.orderNo,
      mail: {
        template: 'EXCHANGE_SHIPPED',
        locale,
        build: (wording) => exchangeShippedMail({
          to: user.email,
          name: user.name,
          orderNo: input.orderNo,
          locale,
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          lines: input.lines.map((l) => ({
            productName: nameOf.get(l.orderItemId) ?? '',
            fromOptionLabel: l.fromOptionLabel,
            toOptionLabel: l.toOptionLabel,
            quantity: l.quantity,
          })),
        }, wording),
      },
      notification: {
        userId: input.userId,
        kind: 'EXCHANGE_SHIPPED',
        params: { orderNo: input.orderNo },
        linkPath: `/order/${input.orderNo}`,
      },
    });
  } catch (error) {
    console.error('[exchange] 교환 발송 알림 실패', input.orderNo, error);
  }
}
