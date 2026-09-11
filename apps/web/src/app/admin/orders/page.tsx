import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { format, ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';
import { OrderSearchError } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminOrders } from '~/lib/queries/admin/orders';
import { ORDER_STATUS } from '@shop/core';
import { isOrderStatus } from '~/lib/queries/mypage';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '주문 관리' };
export const dynamic = 'force-dynamic';

/**
 * 걸러 볼 상태.
 *
 * **손으로 적지 않는다.** 일곱 개를 적어 두었더니 구매확정·반품완료·환불완료가
 * 빠져 있었다 — 운영자에게 그 셋은 정산과 대사가 걸린 자리인데 "전체" 에서
 * 눈으로 찾아야 했다. 상태가 하나 늘면 여기도 함께 늘어야 하는데, 그걸
 * 기억에 맡기면 언젠가 어긋난다.
 *
 * 손님 화면은 넷을 "취소·반품" 한 칸으로 묶는다. 여기서는 묶지 않는다 —
 * 운영자에게 반품접수와 환불완료는 **서로 다른 할 일**이다.
 */
const FILTERS: readonly OrderStatus[] = ORDER_STATUS;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string; cursor?: string; q?: string; from?: string; to?: string;
  }>;
}) {
  const actor = await requireAdmin('order:read');
  const { status, cursor, q, from, to } = await searchParams;
  const filter = status && isOrderStatus(status) ? status : undefined;

  /**
   * 날짜가 잘못 들어오면 목록을 비우지 않고 조건 없이 보여 준다.
   *
   * 주소를 손으로 고치다 형식이 깨지는 일이 있는데, 그때 빈 화면을 주면
   * 주문이 없는 것인지 조건이 틀린 것인지 알 수 없다. 무엇이 잘못됐는지
   * 말해 주고 목록은 계속 보여 준다.
   */
  let page;
  let searchError: string | null = null;
  try {
    page = await getAdminOrders(actor, { status: filter, cursor, q, from, to });
  } catch (error) {
    searchError = error instanceof OrderSearchError ? error.message : '검색 조건을 확인해 주세요.';
    page = await getAdminOrders(actor, { status: filter });
  }
  const orders = page.rows;

  // 필터·검색을 유지한 채 다음 쪽으로 간다. 하나라도 빠뜨리면 넘기는 순간 조건이 풀린다.
  const kept = {
    ...(filter ? { status: filter } : {}),
    ...(q ? { q } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };

  const nextHref = page.nextCursor
    ? {
        pathname: '/admin/orders' as const,
        query: { ...kept, cursor: page.nextCursor },
      }
    : null;

  const searching = Boolean(q || from || to);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">주문 관리</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{page.total}</span>건
            {actor.merchantId && ' · 내 가맹점 상품이 포함된 주문만'}
          </p>
        </div>
      </header>

      <div className="p-8">
        <nav aria-label="주문 상태 필터" className="mb-5 border-b border-[var(--border)]">
          <ul className="flex gap-1 overflow-x-auto">
            <li className="shrink-0">
              <Link
                href={{ pathname: '/admin/orders', query: { ...(q ? { q } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) } }}
                {...(filter === undefined ? { 'aria-current': 'page' as const } : {})}
                className={`inline-flex h-11 items-center whitespace-nowrap px-3.5 text-[13px] no-underline ${
                  filter === undefined
                    ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                    : 'text-[var(--fg-muted)]'
                }`}
              >
                전체
              </Link>
            </li>
            {FILTERS.map((s) => (
              <li key={s} className="shrink-0">
                <Link
                  href={{ pathname: '/admin/orders', query: { ...kept, status: s } }}
                  {...(filter === s ? { 'aria-current': 'page' as const } : {})}
                  className={`inline-flex h-11 items-center whitespace-nowrap px-3.5 text-[13px] no-underline ${
                    filter === s
                      ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                      : 'text-[var(--fg-muted)]'
                  }`}
                >
                  {ORDER_STATUS_LABEL[s]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* GET 폼이라 조건이 주소에 남는다 — 새로고침해도, 공유해도 같은 결과가 나온다 */}
        <form method="get" action="/admin/orders" role="search" className="mb-5 flex flex-wrap items-end gap-3">
          {filter && <input type="hidden" name="status" value={filter} />}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-q" className="text-xs font-medium text-[var(--fg-secondary)]">
              주문번호 · 주문자
            </label>
            <input
              id="order-q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="20260904-1234567 또는 이름"
              maxLength={60}
              className="h-10 w-64 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-from" className="text-xs font-medium text-[var(--fg-secondary)]">
              주문일 시작
            </label>
            <input
              id="order-from" name="from" type="date" defaultValue={from ?? ''}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="order-to" className="text-xs font-medium text-[var(--fg-secondary)]">
              주문일 종료
            </label>
            <input
              id="order-to" name="to" type="date" defaultValue={to ?? ''}
              className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>

          <button
            type="submit"
            className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
          >
            검색
          </button>

          {searching && (
            <Link
              href={{ pathname: '/admin/orders', query: filter ? { status: filter } : {} }}
              className="inline-flex h-10 items-center text-[13px] text-[var(--fg-muted)] underline underline-offset-2"
            >
              조건 지우기
            </Link>
          )}
        </form>

        {searchError && (
          <p role="alert" className="mb-5 rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
            {searchError}
          </p>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {orders.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              {searching
                ? '조건에 맞는 주문이 없습니다. 검색어나 기간을 바꿔 보세요.'
                : filter
                  ? `${ORDER_STATUS_LABEL[filter]} 상태의 주문이 없습니다.`
                  : '주문이 없습니다.'}
            </p>
          ) : (
            <div className="relative overflow-x-auto">
              {/*
                **표는 자기 안에서 민다.** 주문번호·상품명·금액이 한 줄에 들어가서
                태블릿 폭에서는 표가 화면보다 넓어지는데, 그대로 두면 페이지
                전체가 옆으로 밀린다 — 표를 보려던 사람이 헤더와 사이드바까지
                끌고 다니게 된다.

                `relative` 는 안의 sr-only 설명 때문이다. sr-only 는 absolute 라
                기준점이 없으면 스크롤 상자를 빠져나가 문서를 늘린다 —
                쿠폰 표에서 같은 것에 당했다.
              */}
              <div className="table-scroll" tabIndex={0} role="region" aria-label="주문 목록">
                <table className="w-full">
                  <caption className="sr-only">주문 목록</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">주문번호</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">상품</th>
                    <th scope="col" className="w-24 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">주문자</th>
                    <th scope="col" className="w-28 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">금액</th>
                    <th scope="col" className="w-28 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">주문일</th>
                    <th scope="col" className="w-28 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.orderNo} className="border-b border-[var(--surface-2)] last:border-0">
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${o.orderNo}`} className="tnum text-xs text-[var(--fg)]">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        {o.firstItemName}
                        {o.itemCount > 1 && (
                          <span className="text-[var(--fg-muted)]"> 외 <span className="tnum">{o.itemCount - 1}</span>건</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] whitespace-nowrap">{o.buyerName}</td>
                      <td className="tnum px-4 py-3 text-right text-[13px] font-semibold">{format(o.amount)}</td>
                      <td className="tnum px-4 py-3 text-xs text-[var(--fg-muted)]">
                        {o.placedAt.toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone="neutral">{ORDER_STATUS_LABEL[o.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="mt-5">
          <Pager href={nextHref} label="이전 주문 더 보기" hasRows={orders.length > 0} />
        </div>
      </div>
    </>
  );
}
