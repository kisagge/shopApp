import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@shop/ui';
import { RETURN_STAGE_LABEL, RETURN_TYPE, type ReturnType } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { adminDate, adminDateTime } from '~/lib/admin/date-format';
import { getReturnQueue, isReturnQueueView, RETURN_QUEUE_VIEW, type ReturnQueueView } from '~/lib/queries/admin/returns';
import { RETURN_REASON_KEY, RETURN_TYPE_KEY } from '~/lib/i18n/enum-labels';
import { getT } from '~/lib/i18n/server';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '반품·교환' };
export const dynamic = 'force-dynamic';

const VIEW_LABEL: Readonly<Record<ReturnQueueView, string>> = { OPEN: '진행 중 전체', ...RETURN_STAGE_LABEL };

/**
 * 반품·교환 처리 대기열.
 *
 * 주문 목록을 "반품접수" 로 거르면 신청이 어디까지 왔는지가 안 보였다. 여기서는 **단계**(승인 대기 → 물건 도착 대기 →
 * 환불·교환 발송 대기)로 나누고, 줄마다 **내 차례인지** 붙인다 — 가맹점은 환불을, 운영진은 가맹점 상품의 도착 확인을
 * 기다리는 일이 많아서, 누가 쥐고 있는지가 보여야 서로 기다리지 않는다. 처리는 주문 상세에서 한다(한 곳에서만 돈과 재고를
 * 움직인다).
 */
export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; type?: string; cursor?: string }>;
}) {
  const actor = await requireAdmin('return:resolve');
  const params = await searchParams;
  // 주소에 아무 값이나 들어올 수 있다 — 아는 값만 쓴다
  const view: ReturnQueueView = isReturnQueueView(params.view) ? params.view : 'OPEN';
  const type = (RETURN_TYPE as readonly string[]).includes(params.type ?? '') ? (params.type as ReturnType) : undefined;

  const [page, t] = await Promise.all([getReturnQueue(actor, { view, type, cursor: params.cursor }), getT()]);
  const query = (v: ReturnQueueView) => ({ ...(v !== 'OPEN' ? { view: v } : {}), ...(type ? { type } : {}) });
  const nextHref = page.nextCursor
    ? { pathname: '/admin/returns' as const, query: { ...query(view), cursor: page.nextCursor } }
    : null;
  const myTurnCount = page.rows.filter((r) => r.myTurn).length;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">반품·교환</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {actor.merchantId ? '내 상품이 든 신청 · 환불은 운영진이 합니다' : '처리는 주문 상세에서 합니다'}
          </p>
        </div>
        <form method="get" action="/admin/returns" className="flex items-center gap-2">
          {view !== 'OPEN' && <input type="hidden" name="view" value={view} />}
          <label htmlFor="return-type" className="text-[13px] text-[var(--fg-secondary)]">종류</label>
          <select
            id="return-type"
            name="type"
            defaultValue={type ?? ''}
            className="h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
          >
            <option value="">전체</option>
            {RETURN_TYPE.map((v) => <option key={v} value={v}>{t(RETURN_TYPE_KEY[v])}</option>)}
          </select>
          <button type="submit" className="h-10 rounded-sm border border-[var(--border-strong)] px-3 text-[13px]">보기</button>
        </form>
      </header>

      <div className="flex flex-col gap-5 p-4 sm:p-8">
        <nav aria-label="처리 단계" className="flex flex-wrap gap-1 border-b border-[var(--border)]">
          {RETURN_QUEUE_VIEW.map((v) => (
            <Link
              key={v}
              href={{ pathname: '/admin/returns', query: query(v) }}
              aria-current={view === v ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] no-underline ${
                view === v
                  ? 'border-[var(--brand)] font-medium text-[var(--fg)]'
                  : 'border-transparent text-[var(--fg-secondary)] hover:text-[var(--fg)]'
              }`}
            >
              {VIEW_LABEL[v]}
              <span className="tnum ml-1.5 text-[var(--fg-muted)]">{page.counts[v]}</span>
            </Link>
          ))}
        </nav>

        {view !== 'DONE' && page.rows.length > 0 && (
          <p className="text-[13px] text-[var(--fg-secondary)]">
            이 쪽에서 <b className="tnum text-[var(--fg)]">{myTurnCount}</b>건이 내 차례입니다. 오래 기다린 신청부터 보입니다.
          </p>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {page.rows.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              {view === 'DONE' ? '끝난 신청이 없습니다.' : '처리할 신청이 없습니다.'}
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="반품·교환 신청 목록">
              <table>
                <caption className="sr-only">
                  반품·교환 신청 목록, {view === 'DONE' ? '최근에 끝난 순' : '오래 기다린 순'}
                </caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="w-36 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">신청</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">주문 · 상품</th>
                    <th scope="col" className="w-40 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">종류 · 사유</th>
                    <th scope="col" className="w-44 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">단계</th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--surface-2)] align-top last:border-0">
                      <td className="px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                        <time dateTime={r.requestedAt.toISOString()} className="tnum block">{adminDate.format(r.requestedAt)}</time>
                        {r.waitingDays !== null && (
                          <span className={`tnum block ${r.waitingDays >= 3 ? 'font-medium text-warning' : 'text-[var(--fg-muted)]'}`}>
                            {r.waitingDays === 0 ? '오늘 신청' : `${r.waitingDays}일째`}
                          </span>
                        )}
                        {r.resolvedAt && (
                          <span className="block text-[var(--fg-muted)]">
                            끝남 <time dateTime={r.resolvedAt.toISOString()}>{adminDateTime.format(r.resolvedAt)}</time>
                          </span>
                        )}
                      </td>
                      <th scope="row" className="px-4 py-3 text-left font-normal">
                        <Link href={`/admin/orders/${r.orderNo}`} className="tnum text-[13px] text-[var(--fg)] underline-offset-2 hover:underline">
                          {r.orderNo}
                        </Link>
                        <span className="block text-[11px] text-[var(--fg-muted)]">{r.customerName}</span>
                        <span className="block text-[12px] text-[var(--fg-secondary)]">
                          {r.productNames[0]}
                          {r.productNames.length > 1 && ` 외 ${r.productNames.length - 1}줄`}
                        </span>
                      </th>
                      <td className="px-4 py-3 text-[12px]">
                        <span className="block">{t(RETURN_TYPE_KEY[r.type])}</span>
                        <span className="block text-[var(--fg-muted)]">{t(RETURN_REASON_KEY[r.reason])}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={r.stage === 'DONE' ? 'neutral' : 'info'}>{RETURN_STAGE_LABEL[r.stage]}</Badge>
                          {/* 색만으로 말하지 않는다 — 글자로 적는다 */}
                          {r.myTurn && <Badge tone="danger">내 차례</Badge>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <Pager href={nextHref} label="다음 신청 더 보기" hasRows={page.rows.length > 0} />
      </div>
    </>
  );
}
