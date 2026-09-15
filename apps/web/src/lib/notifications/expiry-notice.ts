import 'server-only';
import { prisma } from '@shop/db';
import {
  expiryNoticeUntil, kstDate, mailButton, mailLead, mailList, mailShell, pointsExpiringSoon,
  type MailMessage,
} from '@shop/core';
import { formatNumber, type Locale } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { localeOf } from '~/lib/mail/recipient';
import { wordOf, type MailWording } from '~/lib/mail/templates';
import { deliverNotice } from './deliver';
import { absoluteUrl } from '~/lib/urls';

/** 한 번에 알릴 사람 수. 서버리스 실행 시간이 유한하다 — 남은 사람은 다음 날 실행이 잡는다(한 번만 알리기는 표시가 지킨다) */
const BATCH = 200;

export interface ExpiringCouponMailInput {
  readonly to: string;
  readonly name: string;
  readonly locale: Locale;
  readonly coupons: readonly { readonly name: string; readonly date: string }[];
}

/** 곧 사라지는 쿠폰 메일 — 쿠폰마다 이름과 기한 */
export function expiringCouponMail(input: ExpiringCouponMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const vars = { name: input.name, count: input.coupons.length, date: input.coupons[0]?.date ?? '' };
  const lead = wordOf(t, wording, 'lead', 'mail.couponExpiring.lead', vars);
  const lines = input.coupons.map((c) => `${c.name} · ${t('mail.couponExpiring.until', { date: c.date })}`);
  const url = absoluteUrl('/mypage/coupons');
  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', 'mail.couponExpiring.subject', vars),
    text: [lead, '', ...lines.map((l) => `- ${l}`), '', url].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', 'mail.couponExpiring.heading'),
      bodyHtml: [mailLead(lead), mailList(lines), mailButton(url, t('mail.couponExpiring.view'))].join(''),
      footer: t('mail.footer'),
    }),
  };
}

export interface ExpiringPointsMailInput {
  readonly to: string;
  readonly name: string;
  readonly locale: Locale;
  readonly amount: number;
  readonly days: readonly { readonly date: string; readonly amount: number }[];
}

/** 곧 사라지는 적립금 메일 — 날마다 얼마가 사라지는지 */
export function expiringPointsMail(input: ExpiringPointsMailInput, wording?: MailWording): MailMessage {
  const t = createTranslator(input.locale);
  const vars = { name: input.name, points: formatNumber(input.locale, input.amount), date: input.days[0]?.date ?? '' };
  const lead = wordOf(t, wording, 'lead', 'mail.pointsExpiring.lead', vars);
  const lines = input.days.map((d) => `${d.date} · ${formatNumber(input.locale, d.amount)}P`);
  const url = absoluteUrl('/mypage/points');
  return {
    to: input.to,
    subject: wordOf(t, wording, 'subject', 'mail.pointsExpiring.subject', vars),
    text: [lead, '', ...lines.map((l) => `- ${l}`), '', url].join('\n'),
    html: mailShell({
      heading: wordOf(t, wording, 'heading', 'mail.pointsExpiring.heading'),
      bodyHtml: [mailLead(lead), mailList(lines), mailButton(url, t('mail.pointsExpiring.view'))].join(''),
      footer: t('mail.footer'),
    }),
  };
}

export interface ExpiryNoticeResult {
  readonly couponUsers: number;
  readonly coupons: number;
  readonly pointUsers: number;
  readonly points: number;
}

/**
 * 곧 사라질 쿠폰·적립금을 알린다 — 사람마다 쿠폰 한 통, 적립금 한 통.
 *
 * **표시를 먼저 하고 보낸다.** 반대로 하면 보내고 나서 표시가 실패했을 때 다음 날 또 보낸다. 표시가 먼저면 최악의 경우
 * 알림 하나를 못 받는데, 같은 알림을 매일 받는 것보다 낫다(재입고 알림과 같은 판단). 표시는 조건부로 한다 — 두 실행이
 * 겹쳐도 먼저 표시한 쪽만 보낸다.
 *
 * 탈퇴한 계정은 건너뛰고, 쓸 수 없게 된 쿠폰(운영이 내린 쿠폰·이미 쓴 쿠폰)은 알리지 않는다.
 */
export async function sendExpiryNotices(now: Date = new Date()): Promise<ExpiryNoticeResult> {
  const until = expiryNoticeUntil(now);
  const [coupons, points] = [await noticeCoupons(now, until), await noticePoints(now, until)];
  return { couponUsers: coupons.users, coupons: coupons.items, pointUsers: points.users, points: points.amount };
}

async function noticeCoupons(now: Date, until: Date): Promise<{ users: number; items: number }> {
  const due = await prisma.userCoupon.findMany({
    where: {
      usedAt: null, expiryNoticeAt: null, expiresAt: { gt: now, lte: until },
      coupon: { isActive: true },
      user: { deletedAt: null },
    },
    orderBy: [{ userId: 'asc' }, { expiresAt: 'asc' }],
    take: BATCH * 5,
    select: {
      id: true, userId: true, expiresAt: true,
      coupon: { select: { name: true } },
      user: { select: { email: true, name: true, locale: true } },
    },
  });

  const byUser = new Map<string, typeof due>();
  for (const c of due) byUser.set(c.userId, [...(byUser.get(c.userId) ?? []), c]);

  let users = 0;
  let items = 0;
  for (const [userId, list] of [...byUser].slice(0, BATCH)) {
    const { count } = await prisma.userCoupon.updateMany({
      where: { id: { in: list.map((c) => c.id) }, expiryNoticeAt: null },
      data: { expiryNoticeAt: now },
    });
    if (count === 0) continue; // 다른 실행이 먼저 알렸다
    const user = list[0]!.user;
    const locale = localeOf(user.locale);
    const coupons = list.map((c) => ({ name: c.coupon.name, date: kstDate(c.expiresAt) }));
    await deliverNotice({
      tag: 'expiry:coupon',
      ref: userId,
      mail: {
        template: 'COUPON_EXPIRING',
        locale,
        build: (wording) => expiringCouponMail({ to: user.email, name: user.name, locale, coupons }, wording),
      },
      notification: {
        userId,
        kind: 'COUPON_EXPIRING',
        params: { count: String(coupons.length), date: coupons[0]!.date },
        linkPath: '/mypage/coupons',
      },
    });
    users += 1;
    items += list.length;
  }
  return { users, items };
}

async function noticePoints(now: Date, until: Date): Promise<{ users: number; amount: number }> {
  // 알릴 것이 있을 수 있는 사람만 추린다 — 기한이 7일 안에 드는데 아직 안 알린 적립이 있는 사람
  const candidates = await prisma.pointTransaction.findMany({
    where: { amount: { gt: 0 }, expiryNoticeAt: null, expiresAt: { gt: now, lte: until }, user: { deletedAt: null } },
    distinct: ['userId'],
    take: BATCH,
    select: { userId: true },
  });

  let users = 0;
  let total = 0;
  for (const { userId } of candidates) {
    const [entries, user] = await Promise.all([
      prisma.pointTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { amount: true, createdAt: true, expiresAt: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true, locale: true } }),
    ]);

    // 창 안의 적립은 이미 다 써서 사라질 것이 없어도 표시한다 — 안 그러면 매일 다시 계산한다
    const { count } = await prisma.pointTransaction.updateMany({
      where: { userId, amount: { gt: 0 }, expiryNoticeAt: null, expiresAt: { gt: now, lte: until } },
      data: { expiryNoticeAt: now },
    });
    if (count === 0 || !user) continue;

    const soon = pointsExpiringSoon(entries, now);
    if (!soon) continue;

    const locale = localeOf(user.locale);
    await deliverNotice({
      tag: 'expiry:points',
      ref: userId,
      mail: {
        template: 'POINTS_EXPIRING',
        locale,
        build: (wording) => expiringPointsMail({ to: user.email, name: user.name, locale, amount: soon.amount, days: soon.days }, wording),
      },
      notification: {
        userId,
        kind: 'POINTS_EXPIRING',
        params: { points: soon.amount.toLocaleString('en-US'), date: soon.firstDate },
        linkPath: '/mypage/points',
      },
    });
    users += 1;
    total += soon.amount;
  }
  return { users, amount: total };
}
