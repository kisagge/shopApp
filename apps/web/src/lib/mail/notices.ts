import 'server-only';
import { escapeHtml, mailShell, mailButton, type MailMessage } from '@shop/core';
import { createTranslator, type Locale } from '@shop/i18n';

/**
 * 재입고 · 문의 답변 문안.
 *
 * **주문 안내(orders/notify)와 같은 자리다.** core 는 의존성이 없는 순수
 * 정책 묶음이라 사전을 가져올 수 없어서, 문안은 앱 층에서 만든다. core 에서
 * 가져오는 것은 HTML 껍데기와 이스케이프뿐이다.
 *
 * 예전에는 둘 다 core 에 한국어로 박혀 있었다. 받는 사람의 말을 알 길이
 * 없다는 것이 이유였는데, 이제 계정이 그 말을 들고 있다(User.locale).
 */

export interface RestockMailInput {
  readonly to: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly url: string;
  readonly locale: Locale;
}

export function restockMail(input: RestockMailInput): MailMessage {
  const t = createTranslator(input.locale);
  const item = `${input.productName} (${input.optionLabel})`;

  return {
    to: input.to,
    // 제목에 상품명을 넣는다 — 여러 개를 신청해 뒀다면 어느 것인지가 먼저다
    subject: t('mail.restock.subject', { item }),
    text: [t('mail.restock.lead', { item }), '', input.url, '', t('mail.restock.hurry')].join('\n'),
    html: mailShell({
      heading: t('mail.restock.heading'),
      bodyHtml: [
        `<p style="margin:0">${escapeHtml(t('mail.restock.lead', { item }))}</p>`,
        mailButton(input.url, t('mail.restock.view')),
        `<p style="color:#6f6a63;font-size:13px;margin:0">${escapeHtml(t('mail.restock.hurry'))}</p>`,
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

export interface InquiryAnswerMailInput {
  readonly to: string;
  /**
   * 어떤 상품에 대한 물음이었는가. **없을 수 있다** — 배송이나 환불처럼
   * 상품과 무관한 문의는 고객센터로 들어온다.
   */
  readonly productName?: string | undefined;
  readonly question: string;
  readonly answer: string;
  readonly url: string;
  readonly locale: Locale;
}

/**
 * 문의에 답이 달렸을 때.
 *
 * **물어본 내용을 함께 싣는다.** 여러 상품에 물어 두었다면 어느 것에 대한
 * 답인지가 먼저고, 답만 오면 무슨 말인지 알 수 없다.
 *
 * 너무 길면 자른다 — 메일 미리보기에 본문이 통째로 밀려 들어가면 제목
 * 옆이 지저분해진다.
 */
export function inquiryAnswerMail(input: InquiryAnswerMailInput): MailMessage {
  const t = createTranslator(input.locale);
  const clip = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}…` : value;
  const question = clip(input.question, 200);
  const answer = clip(input.answer, 400);
  // 상품 없는 문의도 온다. 이름 자리를 비워 두면 "undefined 문의" 가 나간다.
  const about = input.productName ?? t('mail.inquiry.support');

  return {
    to: input.to,
    subject: t('mail.inquiry.subject', { about }),
    text: [
      t('mail.inquiry.lead', { about }),
      '',
      `${t('mail.inquiry.question')}: ${question}`,
      `${t('mail.inquiry.answer')}: ${answer}`,
      '',
      input.url,
    ].join('\n'),
    html: mailShell({
      heading: t('mail.inquiry.heading'),
      bodyHtml: [
        `<p style="margin:0">${escapeHtml(t('mail.inquiry.lead', { about }))}</p>`,
        `<p style="color:#6f6a63;font-size:13px;margin:16px 0 0">${escapeHtml(t('mail.inquiry.question'))}</p>`,
        `<p style="margin:4px 0 0">${escapeHtml(question)}</p>`,
        `<p style="color:#6f6a63;font-size:13px;margin:16px 0 0">${escapeHtml(t('mail.inquiry.answer'))}</p>`,
        `<p style="margin:4px 0 0">${escapeHtml(answer)}</p>`,
        mailButton(
          input.url,
          input.productName ? t('mail.inquiry.viewProduct') : t('mail.inquiry.viewList'),
        ),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}
