import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { format, ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { getMyOrders, isOrderStatus, TRACKED_STATUSES } from '~/lib/queries/mypage';

export const metadata: Metadata = { title: '주문 내역' };
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

  const orders = await getMyOrders(session.id, filter);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label="현재 위치" className="pt-6 pb-2">
        <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">← 마이페이지</Link>
      </nav>
      <h1 className="pb-5 text-xl font-semibold tracking-tight md:text-2xl">주문 내역</h1>

      <nav aria-label="주문 상태 필터" className="mb-6 border-b border-[var(--border)]">
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
              전체
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
                {ORDER_STATUS_LABEL[s]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {orders.length === 0 ? (
        <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
          {filter ? `${ORDER_STATUS_LABEL[filter]} 상태의 주문이 없습니다.` : '주문 내역이 없습니다.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <li key={o.orderNo}>
              <article className="rounded-sm border border-[var(--border)] p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2">
                    <Badge tone={toneFor(o.status)}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    <span className="tnum text-[11px] text-[var(--fg-muted)]">
                      {o.placedAt.toLocaleDateString('ko-KR')}
                    </span>
                  </p>
                  <Link href={`/order/${o.orderNo}`} className="text-xs text-[var(--fg-secondary)]">
                    상세 보기
                  </Link>
                </div>
                <p className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{o.firstItemBrand}</p>
                <p className="mt-0.5 text-[13px]">
                  {o.firstItemName}
                  {o.itemCount > 1 && (
                    <span className="text-[var(--fg-muted)]">
                      {' '}외 <span className="tnum">{o.itemCount - 1}</span>건
                    </span>
                  )}
                </p>
                <p className="mt-1 text-[11px] text-[var(--fg-muted)]">{o.firstItemOption}</p>
                <p className="mt-2 flex items-baseline justify-between">
                  <span className="tnum text-[11px] text-[var(--fg-muted)]">{o.orderNo}</span>
                  <span className="tnum text-sm font-semibold">{format(o.payable)}원</span>
                </p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
