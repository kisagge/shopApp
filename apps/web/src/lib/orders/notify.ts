import 'server-only';
import {
  escapeHtml, mailButton, mailLead, mailList, mailRow, mailSectionLabel, mailShell, type MailMessage,
} from '@shop/core';
import {
  formatMoney, formatDateTime, isLocale, DEFAULT_LOCALE, type Locale,
} from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { absoluteUrl } from '~/lib/urls';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from '~/lib/notifications/deliver';
import type { MailTemplateKind, NotificationKind } from '@shop/core';

/**
 * 주문 안내 메일.
 *
 * **주문한 그때의 말로 보낸다.** 사용자에게 언어 설정을 따로 두지 않았고,
 * 두더라도 주문서를 본 말로 오는 편이 맞다 — 그때 화면에서 본 금액·상품명과
 * 같은 말이어야 대조할 수 있다. 그래서 주문이 언어를 들고 있다.
 *
 * 다른 메일(재입고·문의 답변·인증)은 아직 한국어다. 그쪽은 **받는 사람이
 * 요청한 사람이 아니라서** 무슨 말로 보낼지 알 방법이 없다 — 운영자가
 * 답변을 쓸 때 그 운영자의 언어는 받는 사람과 상관없다.
 */

export interface OrderMailItem {
  readonly productName: string;
  readonly optionLabel: string;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface OrderMailInput {
  readonly to: string;
  readonly buyerName: string;
  readonly orderNo: string;
  readonly locale: Locale;
  readonly items: readonly OrderMailItem[];
  readonly payable: number;
  readonly shipTo: string;
  readonly virtualAccount?:
    | { readonly bank: string; readonly accountNumber: string; readonly dueDate: Date | null }
    | undefined;
}

type Kind = 'paid' | 'pending' | 'deposited';

/** 주문 메일 종류와 문구 템플릿 종류 */
const ORDER_MAIL_TEMPLATE: Readonly<Record<Kind, MailTemplateKind>> = {
  paid: 'ORDER_PAID',
  pending: 'ORDER_PENDING',
  deposited: 'ORDER_DEPOSITED',
};

export function orderMail(kind: Kind, input: OrderMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  // 입금 확인 첫 문장에는 이름이 없다 — 템플릿 값 목록도 그렇다(core MAIL_TEMPLATE_PARAMS)
  const lead = wordOf(t, wording, 'lead', `mail.order.${kind}Lead`, kind === 'deposited' ? {} : { name: input.buyerName });
  const money = (won: number): string => formatMoney(input.locale, won);

  const lines = input.items.map(
    (i) => `${i.productName} (${i.optionLabel}) · ${t('mail.order.quantity', { count: i.quantity })} · ${money(i.unitPrice * i.quantity)}`,
  );

  const account =
    kind === 'pending' && input.virtualAccount
      ? [
          '<div style="background:#f6f4f0;border-radius:6px;padding:16px;margin:20px 0">',
          mailRow(t('mail.order.bank'), input.virtualAccount.bank),
          mailRow(t('mail.order.account'), input.virtualAccount.accountNumber),
          input.virtualAccount.dueDate
            ? mailRow(t('mail.order.due'), formatDateTime(input.locale, input.virtualAccount.dueDate))
            : '',
          '</div>',
        ].join('')
      : '';

  const bodyHtml = [
    mailLead(lead),
    mailRow(t('mail.order.orderNo'), input.orderNo),
    account,
    mailSectionLabel(t('mail.order.items')),
    mailList(lines),
    `<p style="margin:20px 0 0;font-weight:600">${escapeHtml(t('mail.order.total'))} ${escapeHtml(money(input.payable))}</p>`,
    mailRow(t('mail.order.shipTo'), input.shipTo),
    mailButton(absoluteUrl(`/order/${input.orderNo}`), t('mail.order.view')),
  ].join('');

  /** 본문 없는 클라이언트를 위한 순수 텍스트. 스팸 판정에도 유리하다. */
  const text = [
    lead,
    '',
    `${t('mail.order.orderNo')} ${input.orderNo}`,
    ...(kind === 'pending' && input.virtualAccount
      ? [
          `${t('mail.order.bank')} ${input.virtualAccount.bank}`,
          `${t('mail.order.account')} ${input.virtualAccount.accountNumber}`,
          ...(input.virtualAccount.dueDate
            ? [`${t('mail.order.due')} ${formatDateTime(input.locale, input.virtualAccount.dueDate)}`]
            : []),
        ]
      : []),
    '',
    t('mail.order.items'),
    ...input.items.map(
      (i) =>
        `- ${i.productName} (${i.optionLabel}) · ${t('mail.order.quantity', { count: i.quantity })} · ${money(i.unitPrice * i.quantity)}`,
    ),
    '',
    `${t('mail.order.total')} ${money(input.payable)}`,
    `${t('mail.order.shipTo')} ${input.shipTo}`,
    '',
    absoluteUrl(`/order/${input.orderNo}`),
  ].join('\n');

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', `mail.order.${kind}Subject`, { orderNo: input.orderNo }),
    text,
    html: mailShell({
      heading: wordOf(t, wording, 'heading', `mail.order.${kind}Heading`),
      bodyHtml,
      footer: t('mail.footer'),
    }),
  };
}

/** 주문 메일 종류와 알림 종류 */
const ORDER_NOTIFICATION_KIND: Readonly<Record<Kind, NotificationKind>> = {
  paid: 'ORDER_PAID',
  pending: 'ORDER_PENDING',
  deposited: 'ORDER_DEPOSITED',
};

/**
 * 알린다 — 메일과 알림함 둘 다.
 *
 * **한동안 메일로만 나갔다.** 배송·취소·환불·반품은 전부 알림함에도 남는데, 가장
 * 많이 오가고 가장 마음 졸이며 확인하는 세 가지가 빠져 있었다. 알림함을 만든 이유가
 * "메일은 놓치기 쉽고 스팸함으로 가기도 한다"(deliver.ts) 인데, 정작 돈이 오가는
 * 자리에는 그 대비가 없었다.
 *
 * 가상계좌(pending)가 특히 그랬다. 그 메일을 놓치면 어디로 입금할지 알 길이 없었다 —
 * 이제 알림을 누르면 계좌가 적힌 주문 화면으로 간다.
 *
 * **실패해도 던지지 않는다.** 결제는 이미 성립했고 주문도 만들어졌다 — 안내가 안
 * 나갔다고 그것을 되돌릴 수는 없다. 메일이 실패해도 알림함에는 남는다(deliver).
 */
export async function deliverOrderNotice(
  kind: Kind,
  input: OrderMailInput & { readonly userId: string },
): Promise<void> {
  await deliverNotice({
    mail: {
      template: ORDER_MAIL_TEMPLATE[kind],
      locale: input.locale,
      build: (wording) => orderMail(kind, input, wording),
    },
    notification: {
      userId: input.userId,
      kind: ORDER_NOTIFICATION_KIND[kind],
      params: { orderNo: input.orderNo },
      // 눌렀을 때 가는 곳. 가상계좌라면 거기 계좌가 적혀 있다.
      linkPath: `/order/${input.orderNo}`,
    },
    tag: 'order',
    ref: input.orderNo,
  });
}

/**
 * 주문에 남은 언어를 읽는다. 없거나 모르는 값이면 기본 언어다.
 *
 * 목록을 여기 다시 적지 않는다 — 언어가 하나 늘 때 사전만 고치고 여기를
 * 빠뜨리면, 새 언어로 주문한 사람에게 한국어 메일이 조용히 나간다.
 */
export function orderLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** 배송지 한 줄. 메일에는 받는 사람과 주소만 있으면 된다. */
export function shipToLine(order: {
  recipient: string;
  postalCode: string;
  address1: string;
  address2: string | null;
}): string {
  const address = [order.address1, order.address2].filter(Boolean).join(' ');
  return `${order.recipient} · (${order.postalCode}) ${address}`;
}
