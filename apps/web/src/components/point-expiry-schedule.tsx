import type { PointExpiryDay } from '@shop/core';
import { formatDate, formatNumber, type Locale, type Translator } from '@shop/i18n';

/**
 * 날짜별 소멸 예정 포인트.
 *
 * 곧(`noticeDays` 안) 사라지는 날은 **색만이 아니라 글자로도** 다르다 — 남은 날수를 적고, 굵게 한다. 색을 못
 * 보는 사람도 어느 줄이 급한지 안다.
 *
 * 날짜는 `<time>` 에 KST 날짜 그대로 싣는다 — 시각까지 적으면 자정 무렵 기한이 기기 시간대에 따라 다른 날로
 * 읽힌다.
 */
export function PointExpirySchedule({
  schedule,
  noticeDays,
  locale,
  t,
}: {
  schedule: readonly PointExpiryDay[];
  noticeDays: number;
  locale: Locale;
  t: Translator;
}) {
  return (
    <section aria-labelledby="expiry-title" className="mt-8">
      <h2 id="expiry-title" className="mb-1 text-[15px] font-semibold">{t('my.pointsExpiryHeading')}</h2>
      <p className="mb-3.5 text-[11px] text-[var(--fg-muted)]">{t('my.pointsExpiryRule')}</p>

      {schedule.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[var(--fg-muted)]">{t('my.pointsExpiryEmpty')}</p>
      ) : (
        <table className="data-table">
          <caption className="sr-only">{t('my.pointsExpiryCaption')}</caption>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th scope="col" className="pb-2.5 text-left text-[11px] text-[var(--fg-muted)]">
                {t('my.pointsExpiryDate')}
              </th>
              <th scope="col" className="pb-2.5 text-left text-[11px] text-[var(--fg-muted)]">
                {t('my.pointsExpiryLeft')}
              </th>
              <th scope="col" className="pb-2.5 text-right text-[11px] text-[var(--fg-muted)]">
                {t('my.pointsExpiryAmount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((day) => {
              const soon = day.daysLeft <= noticeDays;
              return (
                <tr key={day.date} className="border-b border-[var(--surface-2)]">
                  <th scope="row" className="py-3 text-left text-[13px] font-normal">
                    <time className="tnum" dateTime={day.date}>{formatDate(locale, day.expiresAt)}</time>
                  </th>
                  <td className={`tnum py-3 text-[12px] ${soon ? 'font-semibold text-accent' : 'text-[var(--fg-secondary)]'}`}>
                    {day.daysLeft === 0 ? t('my.pointsExpiryToday') : t('my.pointsExpiryDays', { count: day.daysLeft })}
                  </td>
                  <td className={`tnum py-3 text-right text-sm ${soon ? 'font-semibold' : ''}`}>
                    {formatNumber(locale, day.amount)}P
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
