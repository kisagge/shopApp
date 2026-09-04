import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import type { OrderStatus } from '@shop/core';
import { formatMoney } from '@shop/i18n';
import { getSessionUser } from '@shop/auth/session';
import { getMyOrders, isOrderStatus, TRACKED_STATUSES } from '~/lib/queries/mypage';
import { getLocale, getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { ORDER_STATUS_KEY } from '~/lib/i18n/enum-labels';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('order.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/** 취소·환불은 되돌릴 수 없어 시각적으로도 구분한다 */
const toneFor = (status: OrderStatus) =>
  status === 'CANCELLED' || status === 'REFUNDED' || status === 'RETURNED'
    ? ('neutral' as const)
    : status === 'DELIVERED' || status === 'CONFIRMED'
      ? ('success' as const)
      : ('info' as const);

export default async function MyOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage/orders');

  const { status } = await searchParams;
  // 알 수 없는 값이 오면 필터를 무시한다. 던지면 URL 을 만져 본 사용자에게
  // 에러 화면이 뜨는데, 그건 과한 반응이다.
  const filter = status && isOrderStatus(status) ? status : undefined;

  const [orders, locale, t] = await Promise.all([
    getMyOrders(session.id, filter),
    getLocale(),
    getT(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label={t('nav.breadcrumb')} className="pt-6 pb-2">
        <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
          ← {t('nav.mypage')}
        </Link>
      </nav>
      <h1 className="pb-5 text-xl font-semibold tracking-tight md:text-2xl">
        {t('order.heading')}
      </h1>

      <nav aria-label={t('order.statusFilter')} className="mb-6 border-b border-[var(--border)]">
        <ul className="flex gap-1 overflow-x-auto">
          <li>
            <Link
              href="/mypage/orders"
              {...(filter === undefined ? { 'aria-current': 'page' as const } : {})}
              className={`inline-flex h-11 items-center px-3 text-[13px] no-underline ${
                filter === undefined
                  ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                  : 'text-[var(--fg-muted)]'
              }`}
            >
              {t('order.all')}
            </Link>
          </li>
          {TRACKED_STATUSES.map((s) => (
            <li key={s}>
              <Link
                href={`/mypage/orders?status=${s}`}
                {...(filter === s ? { 'aria-current': 'page' as const } : {})}
                className={`inline-flex h-11 items-center whitespace-nowrap px-3 text-[13px] no-underline ${
                  filter === s
                    ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                    : 'text-[var(--fg-muted)]'
                }`}
              >
                {t(ORDER_STATUS_KEY[s])}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {orders.length === 0 ? (
        <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
          {filter ? t('order.emptyFiltered', { status: t(ORDER_STATUS_KEY[filter]) }) : t('order.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.orderNo}>
              <article className="rounded-sm border border-[var(--border)] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2">
                    <Badge tone={toneFor(o.status)}>{t(ORDER_STATUS_KEY[o.status])}</Badge>
                    <span className="tnum text-[11px] text-[var(--fg-muted)]">
                      {o.placedAt.toLocaleDateString('ko-KR')}
                    </span>
                  </p>
                  <Link href={`/order/${o.orderNo}`} className="text-xs text-[var(--fg-secondary)]">
                    {t('order.detail')}
                  </Link>
                </div>
                <p className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{o.firstItemBrand}</p>
                <p className="mt-0.5 text-[13px]">
                  {o.firstItemName}
                  {o.itemCount > 1 && (
                    <span className="text-[var(--fg-muted)]">
                      {' '}
                      {t('order.moreItems', { count: o.itemCount - 1 })}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">{o.firstItemOption}</p>
                <p className="mt-2 flex items-baseline justify-between">
                  <span className="tnum text-[11px] text-[var(--fg-muted)]">{o.orderNo}</span>
                  <span className="tnum text-sm font-semibold">{formatMoney(locale, o.payable)}</span>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
