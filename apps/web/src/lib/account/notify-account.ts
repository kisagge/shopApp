import 'server-only';
import { prisma } from '@shop/db';
import {
  accountNoticeInbox, mailButton, mailLead, mailRow, mailShell,
  type AccountNoticeKind, type MailMessage,
} from '@shop/core';
import { formatDate, formatNumber, type Locale, type MessageKey } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { localeOf } from '~/lib/mail/recipient';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from '~/lib/notifications/deliver';
import type { NoticeInput } from '~/lib/notifications/record';
import { absoluteUrl } from '~/lib/urls';

export interface AccountMailInput {
  readonly kind: AccountNoticeKind;
  readonly to: string;
  readonly name: string;
  readonly locale: Locale;
  /** 적립금 알림: 지급·차감한 양, 사유, 조정 뒤 잔액, (지급이면) 소멸 예정일 */
  readonly points?: number | undefined;
  readonly balance?: number | undefined;
  readonly expiresAt?: Date | null | undefined;
  /** 적립금 사유·정지 사유 */
  readonly reason?: string | null | undefined;
}

const KEY: Readonly<Record<AccountNoticeKind, string>> = {
  POINTS_GRANTED: 'mail.pointsGranted',
  POINTS_DEDUCTED: 'mail.pointsDeducted',
  ACCOUNT_SUSPENDED: 'mail.suspended',
  ACCOUNT_RESTORED: 'mail.restored',
};

/**
 * 계정 메일 — 적립금 지급·차감, 이용 정지·해제.
 *
 * **적립금 메일은 사유와 지금 잔액을 적는다** — "3,000P 차감" 만 오면 왜인지, 그래서 얼마가 남았는지 다시 들어가 봐야 한다.
 * **정지 메일은 무엇이 막히고 무엇은 그대로인지 적는다** — 결제한 주문까지 멈추는 줄 알고 불안해한다. 정지된 사람은 로그인할
 * 수 없으므로 단추는 로그인이 필요 없는 고객센터로 보낸다.
 */
export function accountMail(input: AccountMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const key = (suffix: string) => `${KEY[input.kind]}.${suffix}` as MessageKey;
  const points = input.points === undefined ? '' : formatNumber(input.locale, input.points);
  const vars = { name: input.name, points };
  const lead = wordOf(t, wording, 'lead', key('lead'), vars);
  const isPoints = input.kind === 'POINTS_GRANTED' || input.kind === 'POINTS_DEDUCTED';

  const rows: [string, string][] = [];
  if (input.reason) rows.push([t(isPoints ? 'mail.points.reason' : 'mail.suspended.reason'), input.reason]);
  if (isPoints && input.balance !== undefined) rows.push([t('mail.points.balance'), `${formatNumber(input.locale, input.balance)}P`]);
  if (input.kind === 'POINTS_GRANTED' && input.expiresAt) rows.push([t('mail.points.expires'), formatDate(input.locale, input.expiresAt)]);

  const note = input.kind === 'ACCOUNT_SUSPENDED' ? t('mail.suspended.effect') : null;
  const button =
    isPoints ? { url: absoluteUrl('/mypage/points'), label: t('mail.points.view') }
      : input.kind === 'ACCOUNT_SUSPENDED' ? { url: absoluteUrl('/support'), label: t('mail.suspended.help') }
        : { url: absoluteUrl('/login'), label: t('mail.restored.login') };

  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', key('subject'), vars),
    text: [
      lead,
      ...(rows.length ? ['', ...rows.map(([label, value]) => `${label} ${value}`)] : []),
      ...(note ? ['', note] : []),
      '',
      button.url,
    ].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', key('heading')),
      bodyHtml: [
        mailLead(lead),
        ...rows.map(([label, value]) => mailRow(label, value)),
        note ? mailLead(note) : '',
        mailButton(button.url, button.label),
      ].join(''),
      footer: t('mail.footer'),
    }),
  };
}

/** 받을 사람. 탈퇴한 계정이면 null — 주소가 지워졌다 */
async function recipientOf(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, locale: true, deletedAt: true },
  });
  return user && !user.deletedAt ? { ...user, locale: localeOf(user.locale) } : null;
}

/**
 * 적립금을 손으로 지급·차감했다고 알린다. 조정을 끝낸 창구에서 **새로 처리된 요청일 때만** 부른다 — 같은 열쇠로 다시 온
 * 요청에 또 알리면 두 번 받은 줄 안다. 던지지 않는다.
 */
export async function notifyPointsAdjusted(input: {
  readonly userId: string;
  readonly direction: 'GRANT' | 'DEDUCT';
  readonly amount: number;
  readonly note: string;
  readonly balance: number;
  readonly expiresAt: Date | null;
}): Promise<void> {
  try {
    const user = await recipientOf(input.userId);
    if (!user) return;
    const kind = input.direction === 'GRANT' ? 'POINTS_GRANTED' : 'POINTS_DEDUCTED';
    // 알림 한 줄에 싣는 포인트는 쉼표를 넣어 굳힌다 — 숫자 모양은 세 말 모두 같다
    const shown = input.amount.toLocaleString('en-US');
    await deliverNotice({
      tag: `account:${kind}`,
      ref: input.userId,
      mail: {
        template: kind,
        locale: user.locale,
        build: (wording) => accountMail({
          kind, to: user.email, name: user.name, locale: user.locale,
          points: input.amount, balance: input.balance, expiresAt: input.expiresAt, reason: input.note,
        }, wording),
      },
      notification: input.direction === 'GRANT'
        ? { userId: input.userId, kind: 'POINTS_GRANTED', params: { points: shown }, linkPath: '/mypage/points' }
        : { userId: input.userId, kind: 'POINTS_DEDUCTED', params: { points: shown }, linkPath: '/mypage/points' },
    });
  } catch (error) {
    console.error('[account] 적립금 알림 실패', input.userId, error);
  }
}

/**
 * 이용 정지·해제를 알린다. 정지는 메일로만, 해제는 메일과 알림함(core accountNoticeInbox). 던지지 않는다.
 */
export async function notifySuspension(input: {
  readonly userId: string;
  readonly action: 'SUSPEND' | 'RESTORE';
  readonly reason?: string | null | undefined;
}): Promise<void> {
  try {
    const user = await recipientOf(input.userId);
    if (!user) return;
    const kind = input.action === 'SUSPEND' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_RESTORED';
    const restored: NoticeInput = { userId: input.userId, kind: 'ACCOUNT_RESTORED', params: {}, linkPath: '/mypage' };
    await deliverNotice({
      tag: `account:${kind}`,
      ref: input.userId,
      mail: {
        template: kind,
        locale: user.locale,
        build: (wording) => accountMail({
          kind, to: user.email, name: user.name, locale: user.locale,
          reason: input.action === 'SUSPEND' ? input.reason : null,
        }, wording),
      },
      notification: accountNoticeInbox(kind) ? restored : null,
    });
  } catch (error) {
    console.error('[account] 이용 정지 알림 실패', input.userId, error);
  }
}
