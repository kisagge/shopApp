import type { Metadata } from 'next';
import { format, hasPermission, won } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { reconcilePoints } from '~/lib/admin/reconcile-points';
import { ReconcileButton } from './reconcile-button';

export const metadata: Metadata = { title: '포인트 대사' };
export const dynamic = 'force-dynamic';

export default async function AdminPointsPage() {
  const actor = await requireAdmin('user:read');
  // 화면 진입만으로 고치지 않는다. 보여 주기만 하고, 고치는 것은 명시적으로.
  const result = await reconcilePoints(actor);
  const canFix = hasPermission(actor, 'user:write');

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">포인트 대사</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            최근 <span className="tnum">{result.checked}</span>명 · 원장 합계와 잔액 비교
          </p>
        </div>
        {canFix && <ReconcileButton mismatchCount={result.mismatches.length} />}
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section
          aria-labelledby="summary"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="summary" className="sr-only">대사 요약</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-sm bg-[var(--surface)] p-4">
              <dt className="text-xs text-[var(--fg-muted)]">검사한 회원</dt>
              <dd className="tnum mt-1.5 text-xl font-semibold">{result.checked}명</dd>
            </div>
            <div className="rounded-sm bg-[var(--surface)] p-4">
              <dt className="text-xs text-[var(--fg-muted)]">불일치</dt>
              <dd
                className={`tnum mt-1.5 text-xl font-semibold ${
                  result.mismatches.length > 0 ? 'text-accent' : ''
                }`}
              >
                {result.mismatches.length}건
              </dd>
            </div>
            <div className="rounded-sm bg-[var(--surface)] p-4">
              <dt className="text-xs text-[var(--fg-muted)]">
                초과 지급 <span className="text-[10px]">(원장보다 많이 들고 있는 합)</span>
              </dt>
              <dd className="tnum mt-1.5 text-xl font-semibold">
                {format(won(result.overCredited))}P
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="mismatch-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="mismatch-title" className="mb-1 text-base font-semibold">불일치 목록</h2>
          <p className="mb-4 text-[11px] leading-relaxed text-[var(--fg-muted)]">
            원장이 진실이고 잔액은 캐시입니다. 고치는 방향은 원장 → 잔액 한쪽뿐이며,
            반대로 맞추면 포인트가 어디서 생겼는지 설명할 수 없는 줄이 생깁니다.
          </p>

          {result.mismatches.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-success">
              모든 회원의 잔액이 원장과 일치합니다.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">잔액과 원장이 어긋난 회원</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">회원</th>
                    <th scope="col" className="w-28 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">저장 잔액</th>
                    <th scope="col" className="w-28 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">원장 합계</th>
                    <th scope="col" className="w-28 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">차이</th>
                    <th scope="col" className="w-24 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">원장 줄</th>
                  </tr>
                </thead>
                <tbody>
                  {result.mismatches.map((m) => (
                    <tr key={m.userId} className="border-b border-[var(--surface-2)] last:border-0">
                      <td className="py-3">
                        <span className="block text-[13px]">{m.name}</span>
                        <span className="block text-[11px] text-[var(--fg-muted)]">{m.email}</span>
                      </td>
                      <td className="tnum py-3 text-right text-[13px]">{format(won(m.storedBalance))}</td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">
                        {format(won(m.ledgerBalance))}
                      </td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        {m.difference > 0 ? '+' : ''}{format(won(m.difference))}
                        {/* 부호를 색으로만 알리지 않는다 */}
                        <span className="sr-only">
                          {m.difference > 0 ? ' 초과 지급' : ' 미지급'}
                        </span>
                      </td>
                      <td className="tnum py-3 text-right text-[13px] text-[var(--fg-muted)]">
                        {m.entryCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
