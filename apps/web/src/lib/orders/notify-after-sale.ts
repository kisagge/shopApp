import 'server-only';
import { prisma } from '@shop/db';
import {
  afterSaleByOf, escapeHtml, mailButton, mailLead, mailList, mailRow, mailSectionLabel, mailShell,
  recordsNotification, returnAddressLine, showsReason,
  type AfterSaleBy, type AfterSaleKind, type MailMessage, type ReturnType,
} from '@shop/core';
import { formatMoney, formatNumber, type Locale, type MessageKey } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { CRON_ACTOR } from '~/lib/cron';
import { localeOf } from '~/lib/mail/recipient';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from '~/lib/notifications/deliver';
import { destinationsFor } from './return-address';
import { absoluteUrl } from '~/lib/urls';

export interface AfterSaleMoney {
  readonly refunded: number;
  readonly pointsReturned: number;
  readonly shippingDeducted: number;
}

export interface AfterSaleMailInput {
  readonly kind: AfterSaleKind;
  readonly to: string;
  readonly name: string;
  readonly orderNo: string;
  readonly locale: Locale;
  readonly items: readonly { readonly productName: string; readonly optionLabel: string; readonly quantity: number }[];
  /** 보여 줄 사유. 보여 주지 않을 것이면 부르는 쪽이 비운다(core showsReason) */
  readonly reason?: string | null | undefined;
  readonly returnType?: ReturnType | undefined;
  readonly money?: AfterSaleMoney | undefined;
  /** 승인 메일에 적는 보낼 곳. 판매처가 둘이면 둘 다 적는다 */
  readonly returnTo?: readonly string[] | undefined;
}

/** 종류마다 사전의 열쇠 머리 */
const KEY: Readonly<Record<AfterSaleKind, string>> = {
  ORDER_CANCELLED: 'mail.cancelled',
  RETURN_APPROVED: 'mail.returnApproved',
  RETURN_REJECTED: 'mail.returnRejected',
  REFUND_COMPLETED: 'mail.refunded',
};

/**
 * 취소·반품 승인·반려·환불 메일 — 네 가지가 한 틀을 쓴다.
 *
 * **돈이 걸린 메일은 숫자를 적는다.** "환불되었습니다" 만으로는 얼마가 어디로 돌아갔는지 모른다 — 환불 금액, 돌려준
 * 포인트, 뗀 배송비를 따로 적고, 카드 환불이 늦게 보이는 이유를 한 줄 붙인다(가장 많이 오는 문의다).
 * 승인 메일에는 **다음에 할 일**을, 반려 메일에는 **사유**를 적는다.
 *
 * 고칠 수 있는 칸은 다른 메일과 같이 제목·머리말·첫 문장뿐이다.
 */
export function afterSaleMail(input: AfterSaleMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const key = (suffix: string) => `${KEY[input.kind]}.${suffix}` as MessageKey;
  const lead = wordOf(t, wording, 'lead', key('lead'), { name: input.name });
  const orderUrl = absoluteUrl(`/order/${input.orderNo}`);

  const rows: [string, string][] = [[t('mail.order.orderNo'), input.orderNo]];
  if (input.returnType) rows.push([t('mail.afterSale.type'), t(`returnType.${input.returnType}`)]);
  if (input.reason) rows.push([t('mail.afterSale.reason'), input.reason]);
  const money = input.money;
  if (money && money.refunded > 0) rows.push([t('mail.afterSale.refunded'), formatMoney(input.locale, money.refunded)]);
  if (money && money.pointsReturned > 0) rows.push([t('mail.afterSale.points'), `${formatNumber(input.locale, money.pointsReturned)}P`]);
  if (money && money.shippingDeducted > 0) rows.push([t('mail.afterSale.shipping'), formatMoney(input.locale, money.shippingDeducted)]);

  const returnTo = input.returnTo ?? [];

  const next =
    input.kind === 'RETURN_APPROVED'
      ? t(input.returnType === 'EXCHANGE' ? 'mail.returnApproved.nextExchange' : 'mail.returnApproved.nextReturn')
      : input.kind === 'RETURN_REJECTED'
        ? t('mail.returnRejected.ask')
        : money && money.refunded > 0
          ? t('mail.afterSale.cardNote')
          : null;

  const itemLine = (i: AfterSaleMailInput['items'][number]) =>
    `${i.productName} (${i.optionLabel}) · ${t('mail.order.quantity', { count: i.quantity })}`;

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', key('subject'), { orderNo: input.orderNo }),
    text: [
      lead,
      '',
      ...rows.map(([label, value]) => `${label} ${value}`),
      ...(input.items.length ? ['', t('mail.afterSale.items'), ...input.items.map((i) => `- ${itemLine(i)}`)] : []),
      ...(returnTo.length ? ['', t('mail.returnApproved.sendTo'), ...returnTo.map((a) => `- ${a}`)] : []),
      ...(next ? ['', next] : []),
      '',
      orderUrl,
    ].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', key('heading')),
      bodyHtml: [
        mailLead(lead),
        ...rows.map(([label, value]) => mailRow(label, value)),
        input.items.length ? mailSectionLabel(t('mail.afterSale.items')) + mailList(input.items.map(itemLine)) : '',
        returnTo.length ? mailSectionLabel(t('mail.returnApproved.sendTo')) + mailList(returnTo) : '',
        next ? `<p style="margin:20px 0 0">${escapeHtml(next)}</p>` : '',
        mailButton(orderUrl, t('mail.order.view')),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

/**
 * 손님에게 알린다 — 메일은 늘, 알림함은 남이 했을 때만(core recordsNotification).
 *
 * **처리를 시작한 창구에서 한 번 부른다.** 취소·환불 함수는 서로를 부른다(일부 취소가 남은 줄이 없으면 주문 취소로,
 * 반품 회수가 환불로). 안쪽 함수에서 부르면 한 번의 처리에 알림이 두 통 간다. 그래서 창구(라우트·배치)가 부른다 —
 * 새로 취소·환불 창구를 만들면 여기를 부르는 것을 잊지 말 것.
 *
 * **실패해도 던지지 않는다.** 돈은 이미 돌아갔다 — 알림 때문에 처리를 되돌릴 수 없다.
 */
export async function notifyAfterSale(input: {
  readonly kind: AfterSaleKind;
  readonly orderNo: string;
  readonly actorId: string;
  /** 취소한 줄. 비우면 주문의 줄 전부 */
  readonly itemIds?: readonly string[] | undefined;
  readonly reason?: string | null | undefined;
  readonly money?: AfterSaleMoney | undefined;
}): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { orderNo: input.orderNo },
      select: {
        orderNo: true, userId: true,
        user: { select: { email: true, name: true, locale: true, deletedAt: true } },
        items: { orderBy: { id: 'asc' }, select: { id: true, productName: true, optionLabel: true, quantity: true, merchantId: true } },
        returnRequests: { orderBy: { requestedAt: 'desc' }, take: 1, select: { type: true, itemIds: true, rejectReason: true } },
      },
    });
    if (!order || order.user.deletedAt) return;

    const by: AfterSaleBy = afterSaleByOf({
      actorId: input.actorId, customerId: order.userId, system: input.actorId === CRON_ACTOR.id,
    });
    const request = order.returnRequests[0];
    const isReturn = input.kind === 'RETURN_APPROVED' || input.kind === 'RETURN_REJECTED';

    const pick = (ids: readonly string[] | undefined) =>
      ids && ids.length ? order.items.filter((i) => ids.includes(i.id)) : order.items;
    const items =
      input.kind === 'ORDER_CANCELLED' ? pick(input.itemIds)
        : isReturn && request ? pick(request.itemIds)
          : [];
    /*
     * 승인 메일에는 **보낼 곳을 적는다.** "상품을 보내 주시면" 만 있고 주소가 없으면 손님이 할 수 있는 일이 없다.
     * 판매처가 둘이면 주소도 둘이다(core returnDestinations).
     */
    const returnTo = input.kind === 'RETURN_APPROVED'
      ? (await destinationsFor(items)).flatMap((d) =>
          d.address ? [`${d.address.recipient} · ${returnAddressLine(d.address)} · ${d.address.phone}`] : [])
      : [];
    const locale = localeOf(order.user.locale);
    /*
     * 사유는 누가 적었는지에 따라 온다. 반려 사유는 신청에, 손님 사유는 요청에 있다. 배치가 취소한 것은 결제 대기가
     * 끝나서뿐이라 받는 사람의 말로 적는다 — 배치가 넘긴 한국어를 영어 메일에 그대로 싣지 않는다.
     */
    const reason =
      input.kind === 'RETURN_REJECTED' ? request?.rejectReason
        : by === 'system' ? createTranslator(locale)('mail.afterSale.holdExpired')
          : input.reason;
    await deliverNotice({
      tag: `after-sale:${input.kind}`,
      ref: input.orderNo,
      mail: {
        template: input.kind,
        locale,
        build: (wording) => afterSaleMail({
          kind: input.kind,
          to: order.user.email,
          name: order.user.name,
          orderNo: order.orderNo,
          locale,
          items,
          reason: showsReason(input.kind, by) ? reason : null,
          returnType: isReturn ? (request?.type as ReturnType | undefined) : undefined,
          money: input.money,
          returnTo,
        }, wording),
      },
      notification: recordsNotification(by)
        ? {
            userId: order.userId,
            kind: input.kind,
            params: { orderNo: order.orderNo },
            linkPath: `/order/${order.orderNo}`,
          }
        : null,
    });
  } catch (error) {
    console.error('[after-sale] 알림 실패', input.kind, input.orderNo, error);
  }
}
