import { redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import { TrackedLink as Link } from '~/components/tracked-link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  orderFilterStatuses, isOrderFilterGroup, ORDER_FILTER_TAB,
  readMyOrderSearch, readDateRange, OrderSearchError,
  type DateRange, type OrderStatus,
} from '@shop/core';
import { formatMoney } from '@shop/i18n';
import { getMyOrders } from '~/lib/queries/mypage';
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
  searchParams: Promise<{ status?: string; q?: string; from?: string; to?: string }>;
}) {
  const session = await getViewer();
  if (!session) redirect('/login?next=/mypage/orders');

  const { status, q, from, to } = await searchParams;
  /*
   * 알 수 없는 값이 오면 필터를 무시한다. 던지면 URL 을 만져 본 사용자에게
   * 에러 화면이 뜨는데, 그건 과한 반응이다.
   *
   * 상태 하나일 수도 있고 "취소·반품" 처럼 묶음일 수도 있다. 어느 쪽인지
   * 펴는 일은 core 가 한다 — 화면이 그 목록을 들고 있으면 조회와 갈라진다.
   */
  const statuses = orderFilterStatuses(status);
  const filter = statuses === null ? undefined : status;

  const search = readMyOrderSearch(q);

  /*
   * **날짜가 이상해도 화면은 뜬다.** 주소를 손으로 고쳤거나 시작·종료가
   * 뒤집혔을 때 던지면 오류 화면이 뜨는데, 사용자가 한 일은 날짜를 잘못
   * 적은 것뿐이다. 기간을 무시하고 그 사실을 화면에 적는다.
   */
  let range: DateRange = { from: null, until: null };
  let rangeError: string | null = null;
  try {
    range = readDateRange(from, to);
  } catch (error) {
    rangeError = error instanceof OrderSearchError ? error.message : '기간을 확인해 주세요.';
  }

  const [orders, locale, t] = await Promise.all([
    getMyOrders(session.id, { statuses, search, range }),
    getLocale(),
    getT(),
  ]);

  /**
   * 상태만 남긴 주소. **"조건 지우기" 가 쓰는 자리다.**
   *
   * 지우기는 검색어와 기간만 걷어 내고 보고 있던 탭은 남긴다 — 탭까지
   * 풀리면 사용자가 처음부터 다시 좁혀야 한다.
   */
  const statusOnly = {
    pathname: '/mypage/orders' as const,
    query: filter ? { status: filter } : {},
  };

  /** 상태 탭을 눌러도 검색어와 기간은 들고 간다 */
  const withStatus = (next: string | undefined) => ({
    pathname: '/mypage/orders' as const,
    query: {
      ...(next ? { status: next } : {}),
      ...(q ? { q } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    },
  });
  const narrowed = search.kind !== 'none' || from !== undefined || to !== undefined;

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
        <ul className="scrollbar-none flex gap-1 overflow-x-auto">
          <li className="shrink-0">
            <Link
              href={withStatus(undefined)}
              {...(filter === undefined ? { 'aria-current': 'page' as const } : {})}
              className={`inline-flex h-11 items-center whitespace-nowrap px-3 text-[13px] no-underline ${
                filter === undefined
                  ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                  : 'text-[var(--fg-muted)]'
              }`}
            >
              {t('order.all')}
            </Link>
          </li>
          {ORDER_FILTER_TAB.map((s) => (
            <li key={s} className="shrink-0">
              <Link
                href={withStatus(s)}
                {...(filter === s ? { 'aria-current': 'page' as const } : {})}
                className={`inline-flex h-11 items-center whitespace-nowrap px-3 text-[13px] no-underline ${
                  filter === s
                    ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                    : 'text-[var(--fg-muted)]'
                }`}
              >
                {isOrderFilterGroup(s) ? t('order.closed') : t(ORDER_STATUS_KEY[s])}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/*
        **평범한 GET 폼이다.** 스크립트 없이도 찾을 수 있어야 하고, 결과가
        주소에 남아야 뒤로 가기와 공유가 된다 — 언어·밝기 고르기와 같은 결이다.

        상태는 숨은 칸으로 들고 간다. 탭으로 좁혀 놓고 검색하면 그 탭이
        풀리는 것이 가장 흔한 실망이다.
      */}
      <form method="get" action="/mypage/orders" className="mb-5 flex flex-col gap-3">
        {filter !== undefined && <input type="hidden" name="status" value={filter} />}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
            <label htmlFor="order-q" className="text-[11px] text-[var(--fg-muted)]">
              {t('order.searchLabel')}
            </label>
            <input
              id="order-q"
              type="search"
              name="q"
              defaultValue={q ?? ''}
              placeholder={t('order.searchPlaceholder')}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-from" className="text-[11px] text-[var(--fg-muted)]">
              {t('order.periodFrom')}
            </label>
            <input
              id="order-from"
              type="date"
              name="from"
              defaultValue={from ?? ''}
              className="tnum h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-to" className="text-[11px] text-[var(--fg-muted)]">
              {t('order.periodTo')}
            </label>
            <input
              id="order-to"
              type="date"
              name="to"
              defaultValue={to ?? ''}
              className="tnum h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <button
            type="submit"
            className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
          >
            {t('order.searchSubmit')}
          </button>

          {narrowed && (
            <Link
              href={statusOnly}
              className="flex h-10 items-center px-1 text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
            >
              {t('order.searchReset')}
            </Link>
          )}
        </div>

        {rangeError && (
          <p role="alert" className="text-[12px] text-accent">
            {rangeError} {t('order.periodIgnored')}
          </p>
        )}
      </form>

      {orders.length === 0 ? (
        <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
          {narrowed
            ? t('order.emptySearch')
            : filter === undefined
            ? t('order.empty')
            : t('order.emptyFiltered', {
                status: isOrderFilterGroup(filter) ? t('order.closed') : t(ORDER_STATUS_KEY[filter as OrderStatus]),
              })}
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
