import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { format, ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminOrders } from '~/lib/queries/admin';
import { isOrderStatus } from '~/lib/queries/mypage';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '주문 관리' };
export const dynamic = 'force-dynamic';

const FILTERS: readonly OrderStatus[] = [
  'PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'RETURN_REQUESTED', 'CANCELLED',
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const actor = await requireAdmin('order:read');
  const { status, cursor } = await searchParams;
  const filter = status && isOrderStatus(status) ? status : undefined;
  const page = await getAdminOrders(actor, { status: filter, cursor });
  const orders = page.rows;

  const nextHref = page.nextCursor
    ? {
        pathname: '/admin/orders' as const,
        query: { ...(filter ? { status: filter } : {}), cursor: page.nextCursor },
      }
    : null;

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">주문 관리</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{page.total}</span>건
            {actor.merchantId && ' · 내 가맹점 상품이 포함된 주문만'}
          </p>
        </div>
      </header>

      <main className="p-8">
        <nav aria-label="주문 상태 필터" className="mb-5 border-b border-[var(--border)]">
          <ul className="flex gap-1 overflow-x-auto">
            <li>
              <Link
                href="/admin/orders"
                {...(filter === undefined ? { 'aria-current': 'page' as const } : {})}
                className={`inline-flex h-11 items-center px-3.5 text-[13px] no-underline ${
                  filter === undefined
                    ? 'font-semibold text-[var(--fg)] shadow-[inset_0_-2px_0_var(--fg)]'
                    : 'text-[var(--fg-muted)]'
                }`}
              >
                전체
              </Link>
            </li>
            {FILTERS.map((s) => (
              <li key={s}>
                <Link
                  href={`/admin/orders?status=${s}`}
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

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {orders.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              {filter ? `${ORDER_STATUS_LABEL[filter]} 상태의 주문이 없습니다.` : '주문이 없습니다.'}
            </p>
          ) : (
            <table>
              <caption className="sr-only">주문 목록</caption>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="px-4 py-3 text-xs text-[var(--fg-secondary)]">주문번호</th>
                  <th scope="col" className="px-4 py-3 text-xs text-[var(--fg-secondary)]">상품</th>
                  <th scope="col" className="w-24 px-4 py-3 text-xs text-[var(--fg-secondary)]">주문자</th>
                  <th scope="col" className="w-28 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">금액</th>
                  <th scope="col" className="w-28 px-4 py-3 text-xs text-[var(--fg-secondary)]">주문일</th>
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
                    <td className="px-4 py-3 text-[13px]">{o.buyerName}</td>
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
          )}
        </div>
        <div className="mt-5">
          <Pager href={nextHref} label="이전 주문 더 보기" hasRows={orders.length > 0} />
        </div>
      </main>
    </>
  );
}
