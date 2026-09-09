import 'server-only';
import { escapeHtml, mailShell, mailButton, type MailMessage } from '@shop/core';
import {
  formatMoney, formatDateTime, isLocale, DEFAULT_LOCALE, type Locale,
} from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { getMailer } from '@shop/mail';
import { absoluteUrl } from '~/lib/urls';

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

/** 이름 = 값 한 줄. 메일 클라이언트가 표 레이아웃을 잘 다루지 못해 문단으로 쌓는다. */
function row(label: string, value: string): string {
  return [
    '<p style="margin:0 0 6px"><span style="color:#6f6a63">',
    escapeHtml(label),
    '</span> ',
    escapeHtml(value),
    '</p>',
  ].join('');
}

export function orderMail(kind: Kind, input: OrderMailInput): MailMessage {
  const t = createTranslator(input.locale);
  const money = (won: number): string => formatMoney(input.locale, won);

  const lines = input.items
    .map((i) => {
      const name = `${i.productName} (${i.optionLabel})`;
      const qty = t('mail.order.quantity', { count: i.quantity });
      return `<li style="margin:0 0 4px">${escapeHtml(name)} · ${escapeHtml(qty)} · ${escapeHtml(money(i.unitPrice * i.quantity))}</li>`;
    })
    .join('');

  const account =
    kind === 'pending' && input.virtualAccount
      ? [
          '<div style="background:#f6f4f0;border-radius:6px;padding:16px;margin:20px 0">',
          row(t('mail.order.bank'), input.virtualAccount.bank),
          row(t('mail.order.account'), input.virtualAccount.accountNumber),
          input.virtualAccount.dueDate
            ? row(t('mail.order.due'), formatDateTime(input.locale, input.virtualAccount.dueDate))
            : '',
          '</div>',
        ].join('')
      : '';

  const bodyHtml = [
    `<p style="margin:0 0 20px">${escapeHtml(t(`mail.order.${kind}Lead`, { name: input.buyerName }))}</p>`,
    row(t('mail.order.orderNo'), input.orderNo),
    account,
    `<p style="margin:20px 0 6px;color:#6f6a63">${escapeHtml(t('mail.order.items'))}</p>`,
    `<ul style="margin:0;padding-left:18px">${lines}</ul>`,
    `<p style="margin:20px 0 0;font-weight:600">${escapeHtml(t('mail.order.total'))} ${escapeHtml(money(input.payable))}</p>`,
    row(t('mail.order.shipTo'), input.shipTo),
    mailButton(absoluteUrl(`/order/${input.orderNo}`), t('mail.order.view')),
  ].join('');

  /** 본문 없는 클라이언트를 위한 순수 텍스트. 스팸 판정에도 유리하다. */
  const text = [
    t(`mail.order.${kind}Lead`, { name: input.buyerName }),
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
    subject: t(`mail.order.${kind}Subject`, { orderNo: input.orderNo }),
    text,
    html: mailShell({
      heading: t(`mail.order.${kind}Heading`),
      bodyHtml,
      footer: t('mail.footer'),
    }),
  };
}

/**
 * 보낸다.
 *
 * **실패해도 던지지 않는다.** 결제는 이미 성립했고 주문도 만들어졌다 —
 * 안내 메일이 안 나갔다고 그것을 되돌릴 수는 없다. 재입고 알림과 같은
 * 판단이다. 대신 무엇이 못 나갔는지는 반드시 로그에 남긴다.
 */
export async function sendOrderMail(kind: Kind, input: OrderMailInput): Promise<void> {
  try {
    await getMailer().send(orderMail(kind, input));
  } catch (error) {
    console.error('[order] 안내 메일 발송 실패', {
      kind, orderNo: input.orderNo, to: input.to,
    }, error);
  }
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
