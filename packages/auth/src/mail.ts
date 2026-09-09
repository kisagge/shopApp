import { prisma } from '@shop/db';
import { escapeHtml, mailShell, mailButton, type MailMessage } from '@shop/core';
import { isLocale, resolveLocale, type Locale } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';

/**
 * 인증 메일 문안.
 *
 * **core 가 아니라 여기 있다.** core 는 의존성이 없는 순수 정책 묶음이라
 * 사전을 가져올 수 없다. 주문 안내 메일이 앱 층에 있는 것과 같은 이유다 —
 * HTML 껍데기와 이스케이프만 core 에서 가져오고, 무슨 말을 쓸지는 사전이
 * 정한다.
 *
 * 예전에는 이 두 통이 core 에 한국어로 박혀 있었다. 화면은 세 말로 나가는데
 * **비밀번호를 잊은 사람에게는 한국어만 갔다.**
 */

/**
 * 이 사람에게 어떤 말로 보낼까.
 *
 * **고른 값이 먼저다.** 계정에 말이 있으면 그것이 이긴다 — 지금 어느 기기에서
 * 요청했든 그 사람이 정한 말이 있으면 그것으로 간다.
 *
 * 없으면 **지금 요청의 말**로 물러선다. 가입 직후 확인 메일이 여기에 해당한다
 * — 계정을 만든 훅과 메일 보내는 자리가 앞뒤로 붙어 있어, 아직 저장이 안 된
 * 채로 도달할 수 있다. 그때 기본 말로 보내면 방금 영어 화면에서 가입한
 * 사람에게 한국어가 간다.
 *
 * 둘 다 없으면 기본 말이다.
 */
export async function localeForUser(
  userId: string,
  request: Request | undefined,
): Promise<Locale> {
  const row = await prisma.user
    .findUnique({ where: { id: userId }, select: { locale: true } })
    .catch(() => null);

  if (isLocale(row?.locale)) return row.locale;

  return resolveLocale({
    cookie: null,
    acceptLanguage: request?.headers.get('accept-language') ?? null,
  });
}

export interface LinkMailInput {
  readonly to: string;
  readonly name: string;
  readonly url: string;
  readonly locale: Locale;
}

function linkMail(
  input: LinkMailInput,
  keys: {
    subject: 'mail.verify.subject' | 'mail.reset.subject';
    heading: 'mail.verify.heading' | 'mail.reset.heading';
    lead: 'mail.verify.lead' | 'mail.reset.lead';
    leadText: 'mail.verify.leadText' | 'mail.reset.leadText';
    action: 'mail.verify.action' | 'mail.reset.action';
    ignore: 'mail.verify.ignore' | 'mail.reset.ignore';
  },
): MailMessage {
  const t = createTranslator(input.locale);
  return {
    to: input.to,
    subject: t(keys.subject),
    text: [t(keys.leadText, { name: input.name }), '', input.url, '', t(keys.ignore)].join('\n'),
    html: mailShell({
      heading: t(keys.heading),
      bodyHtml: [
        `<p style="margin:0">${escapeHtml(t(keys.lead, { name: input.name }))}</p>`,
        mailButton(input.url, t(keys.action)),
        `<p style="color:#6f6a63;font-size:13px;margin:0">${escapeHtml(t(keys.ignore))}</p>`,
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

export function verifyEmailMail(input: LinkMailInput): MailMessage {
  return linkMail(input, {
    subject: 'mail.verify.subject',
    heading: 'mail.verify.heading',
    lead: 'mail.verify.lead',
    leadText: 'mail.verify.leadText',
    action: 'mail.verify.action',
    ignore: 'mail.verify.ignore',
  });
}

export function resetPasswordMail(input: LinkMailInput): MailMessage {
  return linkMail(input, {
    subject: 'mail.reset.subject',
    heading: 'mail.reset.heading',
    lead: 'mail.reset.lead',
    leadText: 'mail.reset.leadText',
    action: 'mail.reset.action',
    ignore: 'mail.reset.ignore',
  });
}
