import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { format, won, isDashboardRange, ORDER_STATUS_LABEL, USER_ROLE_LABEL } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getDashboard } from '~/lib/queries/admin/dashboard';
import { RevenueChart } from '~/components/admin/revenue-chart';
import { RangeTabs } from '~/components/admin/range-tabs';

export const metadata: Metadata = { title: '대시보드' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireAdmin();

  // 주소에 아무 값이나 들어올 수 있다. 아는 값이 아니면 기본값으로 되돌린다 —
  // 오류를 내면 링크를 잘못 눌렀을 뿐인 사람에게 빈 화면을 보여 주게 된다.
  const raw = (await searchParams)['range'];
  const range = typeof raw === 'string' && isDashboardRange(raw) ? raw : '7d';

  const d = await getDashboard(actor, range);

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">대시보드</h1>
          {d.scope && (
            <p className="text-[13px] text-[var(--fg-muted)]">
              내 가맹점 기준으로만 집계됩니다
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <RangeTabs current={range} />
          <p className="text-[13px] text-[var(--fg-muted)]">{USER_ROLE_LABEL[actor.role]}</p>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="sr-only">{d.rangeLabel} 주요 지표</h2>
          <ul className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {/*
              총매출만 두면 실제로 남은 돈보다 커 보이고, 순매출만 두면 그
              숫자가 왜 그런지 알 수 없다. 환불을 가운데 두어 대조되게 한다.
            */}
            <Kpi
              label={`${d.rangeLabel} 순매출`}
              value={`${format(d.period.netRevenue)}원`}
              note={`총 ${format(d.period.revenue)}원 · 환불 ${format(d.period.refunded)}원`}
            />
            <Kpi label={`${d.rangeLabel} 주문`} value={`${d.period.orderCount}건`} />
            <Kpi label="객단가" value={`${format(d.period.averageOrderValue)}원`} />
            {d.funnel ? (
              <Kpi
                label="구매 전환율"
                value={`${d.funnel.at(-1)?.rateFromStart ?? 0}%`}
                note={`상품 조회 ${d.funnel[0]?.sessions ?? 0}세션 · 결제 ${d.funnel.at(-1)?.sessions ?? 0}세션`}
              />
            ) : (
              <Kpi label="재고 부족" value={`${d.todo.lowStock}개`} note="5개 이하 옵션" />
            )}
          </ul>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section
            aria-labelledby="chart-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-2 flex items-start justify-between gap-5">
              <div className="flex flex-col gap-1">
                <h2 id="chart-title" className="text-base font-semibold">매출 추이</h2>
                <p className="text-xs text-[var(--fg-muted)]">
                  {d.rangeLabel} · 결제한 날에 더하고 환불한 날에 뺀다
                </p>
              </div>
              <p className="flex items-baseline gap-2">
                <span className="text-xs text-[var(--fg-muted)]">기간 합계</span>
                <span className="tnum text-lg font-semibold">
                  {format(won(d.dailyRevenue.reduce((s, r) => s + r.revenue, 0)))}원
                </span>
              </p>
            </div>
            <RevenueChart data={d.dailyRevenue} label={d.rangeLabel} />
          </section>

          <section
            aria-labelledby="todo-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="todo-title" className="mb-4 text-base font-semibold">처리가 필요한 일</h2>
            <ul className="flex flex-col">
              <Todo href="/admin/orders?status=PREPARING" label="배송 준비 중" count={d.todo.preparing} />
              <Todo href="/admin/orders?status=PENDING" label="입금 대기" count={d.todo.pendingPayment} />
              <Todo
                href="/admin/orders?status=RETURN_REQUESTED"
                label="반품 요청"
                count={d.todo.returnRequested}
                urgent
              />
              <Todo href="/admin/products" label="품절 임박 (재고 5개 이하)" count={d.todo.lowStock} last />
            </ul>
          </section>
        </div>

        {d.funnel && (
          <section
            aria-labelledby="funnel-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-4 flex flex-col gap-1">
              <h2 id="funnel-title" className="text-base font-semibold">구매 퍼널</h2>
              <p className="text-xs text-[var(--fg-muted)]">
                {d.rangeLabel} 세션 기준 · 앞 단계를 거친 세션만 다음 단계로 셉니다
              </p>
            </div>
            <ol className="grid grid-cols-4 gap-3">
              {d.funnel.map((step) => (
                <li key={step.step} className="rounded-sm bg-[var(--surface)] p-4">
                  <p className="text-xs text-[var(--fg-muted)]">{step.label}</p>
                  <p className="tnum mt-1.5 text-2xl font-semibold">{step.sessions}</p>
                  <p className="tnum mt-1 text-[11px] text-[var(--fg-secondary)]">
                    시작 대비 {step.rateFromStart}%
                  </p>
                  {step.droppedFromPrevious > 0 && (
                    <p className="tnum mt-0.5 text-[11px] text-accent">
                      −{step.droppedFromPrevious} 이탈
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="grid gap-5 xl:grid-cols-2">
          <section
            aria-labelledby="top-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <h2 id="top-title" className="mb-4 text-base font-semibold">판매 상위 상품</h2>
            {d.topProducts.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--fg-muted)]">
                {d.rangeLabel} 판매 기록이 없습니다.
              </p>
            ) : (
              <table className="data-table">
                <caption className="sr-only">{d.rangeLabel} 판매 상위 상품</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="w-7 pb-2.5 text-left text-[11px] text-[var(--fg-secondary)]">#</th>
                    <th scope="col" className="pb-2.5 text-left text-[11px] text-[var(--fg-secondary)]">상품</th>
                    <th scope="col" className="w-16 pb-2.5 text-right text-[11px] text-[var(--fg-secondary)]">판매</th>
                    <th scope="col" className="w-24 pb-2.5 text-right text-[11px] text-[var(--fg-secondary)]">매출</th>
                  </tr>
                </thead>
                <tbody>
                  {d.topProducts.map((p, i) => (
                    <tr key={p.productName} className="border-b border-[var(--surface-2)]">
                      <td className="tnum py-3 text-xs font-semibold">{i + 1}</td>
                      <td className="py-3">
                        <span className="block text-[13px]">{p.productName}</span>
                        <span className="block text-[11px] text-[var(--fg-muted)]">{p.brandName}</span>
                      </td>
                      <td className="tnum py-3 text-right text-[13px]">{p.quantity}</td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">
                        {format(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section
            aria-labelledby="recent-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="recent-title" className="text-base font-semibold">최근 주문</h2>
              <Link href="/admin/orders" className="text-xs text-[var(--fg-secondary)]">전체 보기</Link>
            </div>
            {d.recentOrders.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-[var(--fg-muted)]">주문이 없습니다.</p>
            ) : (
              <table className="data-table">
                <caption className="sr-only">최근 접수된 주문</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-[11px] text-[var(--fg-secondary)]">주문번호</th>
                    <th scope="col" className="pb-2.5 text-left text-[11px] text-[var(--fg-secondary)]">주문자</th>
                    <th scope="col" className="pb-2.5 text-right text-[11px] text-[var(--fg-secondary)]">금액</th>
                    <th scope="col" className="w-24 pb-2.5 text-right text-[11px] text-[var(--fg-secondary)]">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {d.recentOrders.map((o) => (
                    <tr key={o.orderNo} className="border-b border-[var(--surface-2)]">
                      <td className="py-3">
                        <Link href={`/admin/orders/${o.orderNo}`} className="tnum text-xs text-[var(--fg)]">
                          {o.orderNo}
                        </Link>
                      </td>
                      <td className="py-3 text-[13px]">{o.buyerName}</td>
                      <td className="tnum py-3 text-right text-[13px]">{format(o.amount)}</td>
                      <td className="py-3 text-right">
                        <Badge tone="neutral">{ORDER_STATUS_LABEL[o.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <li className="flex flex-col gap-2.5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
      <p className="tnum text-[27px] font-semibold tracking-tight">{value}</p>
      {note && <p className="text-xs text-[var(--fg-secondary)]">{note}</p>}
    </li>
  );
}

function Todo({
  href, label, count, urgent, last,
}: {
  href: '/admin/orders?status=PREPARING' | '/admin/orders?status=PENDING'
    | '/admin/orders?status=RETURN_REQUESTED' | '/admin/products';
  label: string;
  count: number;
  urgent?: boolean;
  last?: boolean;
}) {
  return (
    <li className={last ? '' : 'border-b border-[var(--surface-2)]'}>
      <Link href={href} className="flex min-h-13 items-center justify-between gap-3 no-underline">
        <span className="flex items-center gap-2 text-[13px]">
          {label}
          {urgent && count > 0 && <Badge tone="danger">확인 필요</Badge>}
        </span>
        <span className="flex items-center gap-2">
          <span className={`tnum text-base font-semibold ${urgent && count > 0 ? 'text-accent' : ''}`}>
            {count}
          </span>
          <span aria-hidden="true" className="text-[var(--fg-muted)]">›</span>
        </span>
      </Link>
    </li>
  );
}
