import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { EXPIRY_NOTICE_DAYS, isPointReason } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { getPointHistory, getMyPageSummary, getExpiringPoints } from '~/lib/queries/mypage';
import { formatDate, formatNumber } from '@shop/i18n';
import { POINT_REASON_KEY } from '~/lib/i18n/enum-labels';
import { getLocale, getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.pointsHeading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';



export default async function PointsPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage/points');

  const [summary, history, expiring, locale, t] = await Promise.all([
    getMyPageSummary(session.id),
    getPointHistory(session.id),
    getExpiringPoints(session.id),
    getLocale(),
    getT(),
  ]);
  if (!summary) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label={t('nav.breadcrumb')} className="pt-6 pb-2">
        <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
          ← {t('nav.mypage')}
        </Link>
      </nav>
      <h1 className="pb-5 text-xl font-semibold tracking-tight md:text-2xl">{t('my.pointsHeading')}</h1>

      <p className="rounded-sm border border-[var(--border)] p-5 text-center">
        <span className="block text-[11px] text-[var(--fg-muted)]">{t('my.pointsAvailable')}</span>
        <span className="tnum mt-1.5 block text-3xl font-semibold">
          {formatNumber(locale, summary.pointBalance)}
          <span className="ml-1 text-lg">P</span>
        </span>
        {expiring > 0 && (
          // 말없이 사라지면 잔액이 왜 줄었는지 알 수 없다
          <span className="mt-2 block text-[12px] text-accent">
            {t('my.pointsExpiring', {
              amount: `${formatNumber(locale, expiring)}P`,
              days: EXPIRY_NOTICE_DAYS,
            })}
          </span>
        )}
      </p>

      <section aria-labelledby="history-title" className="mt-8">
        <h2 id="history-title" className="mb-3.5 text-[15px] font-semibold">{t('my.pointsHistory')}</h2>
        {history.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
            {t('my.pointsEmpty')}
          </p>
        ) : (
          <table>
            <caption className="sr-only">{t('my.pointsHistoryCaption')}</caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="pb-2.5 text-[11px] text-[var(--fg-muted)]">
                  {t('my.pointsWhat')}
                </th>
                <th scope="col" className="pb-2.5 text-right text-[11px] text-[var(--fg-muted)]">
                  {t('my.pointsChange')}
                </th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b border-[var(--surface-2)]">
                  <td className="py-3">
                    {/* 모르는 사유가 오면 값을 그대로 보여 준다 — 열쇠 이름을 내보내지 않는다 */}
                    <span className="block text-[13px]">
                      {isPointReason(h.reason) ? t(POINT_REASON_KEY[h.reason]) : h.reason}
                    </span>
                    {h.note && <span className="block text-[11px] text-[var(--fg-muted)]">{h.note}</span>}
                    <span className="tnum block text-[11px] text-[var(--fg-muted)]">
                      {formatDate(locale, h.createdAt)}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {/* 부호를 색으로만 알리지 않는다 — + / − 를 함께 쓴다 */}
                    <span
                      className={`tnum text-sm font-semibold ${h.amount > 0 ? 'text-success' : 'text-[var(--fg)]'}`}
                    >
                      {h.amount > 0 ? '+' : '−'}
                      {formatNumber(locale, Math.abs(h.amount))}P
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
