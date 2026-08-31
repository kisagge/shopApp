import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { format } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getSettlements, getPendingSettlement } from '~/lib/queries/admin';

export const metadata: Metadata = { title: '정산' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  PENDING: '확정 대기', CONFIRMED: '확정', PAID: '지급 완료', HELD: '보류',
};

export default async function SettlementsPage() {
  const actor = await requireAdmin('settlement:read');
  const [settlements, pending] = await Promise.all([
    getSettlements(actor),
    getPendingSettlement(actor),
  ]);

  return (
    <>
      <header className="flex h-17 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">정산</h1>
        {actor.merchantId && <p className="text-[13px] text-[var(--fg-muted)]">내 가맹점</p>}
      </header>

      <main className="flex flex-col gap-5 p-8">
        {pending && (
          <section
            aria-labelledby="pending-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-4 flex flex-col gap-1">
              <h2 id="pending-title" className="text-base font-semibold">미정산 예상 금액</h2>
              <p className="text-xs text-[var(--fg-muted)]">
                구매확정된 주문 기준 · 수수료 <span className="tnum">{pending.commissionPercent}%</span>
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-4">
              <div className="rounded-sm bg-[var(--surface)] p-4">
                <dt className="text-xs text-[var(--fg-muted)]">확정 매출</dt>
                <dd className="tnum mt-1.5 text-xl font-semibold">{format(pending.gross)}원</dd>
              </div>
              <div className="rounded-sm bg-[var(--surface)] p-4">
                <dt className="text-xs text-[var(--fg-muted)]">수수료</dt>
                <dd className="tnum mt-1.5 text-xl font-semibold text-accent">
                  −{format(pending.commission)}원
                </dd>
              </div>
              <div className="rounded-sm bg-[var(--surface)] p-4">
                <dt className="text-xs text-[var(--fg-muted)]">지급 예정</dt>
                <dd className="tnum mt-1.5 text-xl font-semibold">{format(pending.net)}원</dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--fg-muted)]">
              정산 확정 배치가 아직 없어 실시간으로 계산한 값입니다. 확정 절차가 붙으면
              이 금액이 정산 내역으로 굳습니다.
            </p>
          </section>
        )}

        <section
          aria-labelledby="history-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="history-title" className="mb-4 text-base font-semibold">정산 내역</h2>
          {settlements.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
              확정된 정산 내역이 없습니다.
            </p>
          ) : (
            <table>
              <caption className="sr-only">정산 내역</caption>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="pb-2.5 text-xs text-[var(--fg-secondary)]">기간</th>
                  {!actor.merchantId && (
                    <th scope="col" className="pb-2.5 text-xs text-[var(--fg-secondary)]">가맹점</th>
                  )}
                  <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">매출</th>
                  <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">수수료</th>
                  <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">지급액</th>
                  <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--surface-2)]">
                    <td className="tnum py-3 text-xs">
                      {s.periodStart.toLocaleDateString('ko-KR')} ~ {s.periodEnd.toLocaleDateString('ko-KR')}
                    </td>
                    {!actor.merchantId && <td className="py-3 text-[13px]">{s.merchantName}</td>}
                    <td className="tnum py-3 text-right text-[13px]">{format(s.grossAmount)}</td>
                    <td className="tnum py-3 text-right text-[13px] text-accent">
                      −{format(s.commissionAmount)}
                    </td>
                    <td className="tnum py-3 text-right text-[13px] font-semibold">{format(s.netAmount)}</td>
                    <td className="py-3 text-center">
                      <Badge tone={s.status === 'PAID' ? 'success' : 'neutral'}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
