import { redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, GRADE_REWARD_PERCENT,
} from '@shop/core';
import { getMyPageSummary, getMyOrders, TRACKED_STATUSES } from '~/lib/queries/mypage';
import { formatDate, formatMoney, formatPercent } from '@shop/i18n';
import { getLocale, getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { ORDER_STATUS_KEY, GRADE_KEY } from '~/lib/i18n/enum-labels';
import { AnalyticsConsentToggle } from '~/components/analytics-consent-toggle';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function MyPage() {
  const session = await getViewer();
  if (!session) redirect('/login?next=/mypage');

  const [summary, recent, locale, t] = await Promise.all([
    getMyPageSummary(session.id),
    getMyOrders(session.id, undefined, 1),
    getLocale(),
    getT(),
  ]);
  if (!summary) redirect('/login');

  const { gradeProgress: gp } = summary;

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-5 text-xl font-semibold tracking-tight md:text-2xl">
        {t('my.heading')}
      </h1>

      <section aria-labelledby="profile-title" className="flex flex-col gap-4">
        <h2 id="profile-title" className="sr-only">{t('my.profile')}</h2>
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-lg"
          >
            {summary.name.slice(0, 1)}
          </span>
          <div className="flex flex-1 flex-col gap-1.5">
            <p className="flex items-center gap-2">
              <span className="text-[17px] font-semibold">{summary.name}</span>
              <Badge tone="new">{t(GRADE_KEY[summary.grade])}</Badge>
            </p>
            <p className="text-xs text-[var(--fg-muted)]">{summary.email}</p>
          </div>
        </div>

        <div className="rounded-sm border border-[var(--border)] p-4">
          {gp.next ? (
            <>
              <p className="mb-2 flex items-baseline justify-between text-[13px]">
                <span className="tnum text-[var(--fg-secondary)]">
                  {t('my.toNextGrade', {
                    grade: t(GRADE_KEY[gp.next]),
                    amount: formatMoney(locale, gp.remaining),
                  })}
                </span>
                <span className="tnum text-[11px] text-[var(--fg-muted)]">{gp.percent}%</span>
              </p>
              <div
                role="progressbar"
                aria-valuenow={gp.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('my.gradeProgress', { grade: t(GRADE_KEY[gp.next]) })}
                className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]"
              >
                <span className="block h-full bg-n-900" style={{ width: `${gp.percent}%` }} />
              </div>
            </>
          ) : (
            <p className="text-[13px] text-[var(--fg-secondary)]">{t('my.topGrade')}</p>
          )}
          <p className="mt-2.5 text-[11px] text-[var(--fg-muted)]">
            {t('my.gradeNote', {
              percent: formatPercent(locale, GRADE_REWARD_PERCENT[summary.grade]),
            })}
          </p>
        </div>

        <ul className="grid grid-cols-3 rounded-sm border border-[var(--border)]">
          <li>
            <Link href="/mypage/points" className="flex h-[68px] flex-col items-center justify-center gap-1 no-underline">
              <span className="tnum text-[17px] font-semibold text-[var(--fg)]">{format(summary.pointBalance)}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">{t('my.points')}</span>
            </Link>
          </li>
          <li className="border-l border-[var(--border)]">
            {/* 숫자만 보여 주고 갈 곳이 없으면 막다른 길이 된다 — 찜과 같은 이유 */}
            <Link
              href="/mypage/coupons"
              className="flex h-[68px] flex-col items-center justify-center gap-1 text-[var(--fg)] no-underline"
            >
              <span className="tnum text-[17px] font-semibold">{summary.couponCount}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">{t('my.coupons')}</span>
            </Link>
          </li>
          <li className="border-l border-[var(--border)]">
            {/* 숫자만 보여 주고 갈 곳이 없으면 막다른 길이 된다 */}
            <Link
              href="/mypage/wishlist"
              className="flex h-[68px] flex-col items-center justify-center gap-1 text-[var(--fg)] no-underline"
            >
              <span className="tnum text-[17px] font-semibold">{summary.wishlistCount}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">{t('my.wishlist')}</span>
            </Link>
          </li>
        </ul>
      </section>

      <section aria-labelledby="status-title" className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="status-title" className="text-[15px] font-semibold">{t('my.orderStatus')}</h2>
          <Link href="/mypage/orders" className="text-xs text-[var(--fg-secondary)]">
            {t('my.allOrders')}
          </Link>
        </div>
        <ol className="grid grid-cols-5">
          {TRACKED_STATUSES.map((s) => {
            const count = summary.statusCounts[s];
            return (
              <li key={s}>
                <Link
                  href={`/mypage/orders?status=${s}`}
                  className="flex flex-col items-center gap-1.5 py-1 no-underline"
                >
                  <span
                    className={`tnum text-[19px] font-semibold ${count === 0 ? 'text-n-300' : 'text-[var(--fg)]'}`}
                  >
                    {count}
                  </span>
                  <span className="text-center text-[10px] text-[var(--fg-muted)]">
                    {t(ORDER_STATUS_KEY[s])}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {recent[0] && (
        <section aria-labelledby="recent-title" className="mt-10">
          <h2 id="recent-title" className="mb-4 text-[15px] font-semibold">{t('my.recentOrder')}</h2>
          <article className="rounded-sm border border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2">
                <Badge tone={recent[0].status === 'CANCELLED' || recent[0].status === 'REFUNDED' ? 'neutral' : 'info'}>
                  {t(ORDER_STATUS_KEY[recent[0].status])}
                </Badge>
                <span className="tnum text-[11px] text-[var(--fg-muted)]">
                  {formatDate(locale, recent[0].placedAt)}
                </span>
              </p>
              <Link href={`/order/${recent[0].orderNo}`} className="text-xs text-[var(--fg-secondary)]">
                {t('order.detail')}
              </Link>
            </div>
            <p className="text-[13px]">
              {recent[0].firstItemName}
              {recent[0].itemCount > 1 && (
                <span className="text-[var(--fg-muted)]">
                  {' '}
                  {t('order.moreItems', { count: recent[0].itemCount - 1 })}
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] text-[var(--fg-muted)]">{recent[0].firstItemOption}</p>
            <p className="tnum mt-2 text-sm font-semibold">{formatMoney(locale, recent[0].payable)}</p>
          </article>
        </section>
      )}

      <nav aria-label={t('my.menu')} className="mt-10 border-t border-[var(--border)]">
        <ul>
          {(
            [
              { href: '/mypage/orders', label: t('order.heading') },
              { href: '/mypage/wishlist', label: t('my.wishlistHeading') },
              { href: '/mypage/points', label: t('my.pointsHeading') },
              { href: '/mypage/addresses', label: t('my.addressesHeading') },
              { href: '/mypage/coupons', label: t('my.couponsHeading') },
              { href: '/mypage/restock', label: t('my.restockHeading') },
              { href: '/mypage/inquiries', label: t('support.myInquiries') },
              { href: '/mypage/notifications', label: t('notif.heading') },
            ] as const
          ).map((m) => (
            <li key={m.href} className="border-b border-[var(--border)]">
              <Link
                href={m.href}
                className="flex min-h-13 items-center justify-between px-1 text-sm no-underline"
              >
                <span>{m.label}</span>
                <span aria-hidden="true" className="text-[var(--fg-muted)]">›</span>
              </Link>
            </li>
          ))}
          <li className="border-b border-[var(--border)]">
            <Link
              href="/mypage/reviews"
              className="flex min-h-13 items-center justify-between px-1 text-sm text-[var(--fg)] no-underline"
            >
              <span>{t('my.writeReview')}</span>
              <span className="flex items-center gap-2">
                {summary.reviewableCount > 0 && (
                  <span className="tnum text-xs font-semibold text-accent">
                    {t('my.reviewable', { count: summary.reviewableCount })}
                  </span>
                )}
                <span aria-hidden="true" className="text-[var(--fg-muted)]">›</span>
              </span>
            </Link>
          </li>
        </ul>
      </nav>

      {/* 거부할 길이 없으면 동의가 아니다 */}
      <AnalyticsConsentToggle />

      {/*
        탈퇴는 목록 안에 섞지 않는다. 되돌릴 수 없는 동작이 "쿠폰함" 옆에
        같은 모양으로 있으면 잘못 눌린다. 대신 숨기지도 않는다 — 찾을 수
        없는 탈퇴 버튼은 탈퇴를 막는 것과 같다.
      */}
      <p className="mt-10 border-t border-[var(--border)] pt-5 text-center">
        <Link
          href="/mypage/close"
          className="text-xs text-[var(--fg-muted)] underline underline-offset-2"
        >
          {t('my.close')}
        </Link>
      </p>
    </div>
  );
}
