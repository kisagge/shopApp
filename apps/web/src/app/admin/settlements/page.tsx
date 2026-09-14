import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, won, hasPermission, previousYearMonth, settlementPeriod, isClosedPeriod,
  SETTLEMENT_STATUS_LABEL, SettlementError, type SettlementStatus,
} from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getSettlements } from '~/lib/queries/admin/settlements';
import { previewSettlements } from '~/lib/admin/close-settlement';
import { CloseButton, PayButton } from './settlement-actions';

export const metadata: Metadata = { title: '정산' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

/** 기간 끝은 다음 달 1일 00:00 이라 그대로 찍으면 하루 뒤로 보인다 */
function endLabel(end: Date): string {
  return dateFormat.format(new Date(end.getTime() - 1));
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const actor = await requireAdmin('settlement:read');
  const params = await searchParams;

  const now = new Date();
  const requested = params.period ?? previousYearMonth(now);

  let yearMonth = requested;
  let periodError: string | null = null;
  try {
    settlementPeriod(requested);
  } catch (error) {
    periodError = error instanceof SettlementError ? error.message : '기간을 확인해 주세요.';
    yearMonth = previousYearMonth(now);
  }

  const period = settlementPeriod(yearMonth);
  const closed = isClosedPeriod(period, now);

  const [drafts, settlements] = await Promise.all([
    previewSettlements(actor, yearMonth),
    getSettlements(actor),
  ]);

  const canConfirm = hasPermission(actor, 'settlement:confirm');
  const canPay = hasPermission(actor, 'settlement:pay');
  const total = won(drafts.reduce<number>((sum, d) => sum + d.netAmount, 0));

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">정산</h1>
          {actor.merchantId && <p className="text-[13px] text-[var(--fg-muted)]">내 가맹점</p>}
        </div>

        <form method="get" action="/admin/settlements" className="flex items-center gap-2">
          <label htmlFor="period" className="text-[12px] text-[var(--fg-secondary)]">정산 기간</label>
          <input
            id="period"
            type="month"
            name="period"
            defaultValue={yearMonth}
            className="tnum h-10 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
          />
          <button
            type="submit"
            className="h-10 rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)]"
          >
            조회
          </button>
        </form>
      </header>

      <div className="flex flex-col gap-5 p-8">
        {periodError && (
          <p role="alert" className="text-[12px] text-accent">
            {periodError} {yearMonth} 기준으로 보여 줍니다.
          </p>
        )}

        <section
          aria-labelledby="draft-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="draft-title" className="text-base font-semibold">
                <span className="tnum">{yearMonth}</span> 정산 초안
              </h2>
              <p className="text-xs text-[var(--fg-muted)]">
                {dateFormat.format(period.start)} ~ {endLabel(period.end)} · 구매확정 기준
                {!closed && <span className="ml-2 text-warning">진행 중인 기간 — 확정할 수 없습니다</span>}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/*
                **숫자가 어느 주문에서 왔는지.** 합계 한 줄로는 자기 장부와 맞춰 볼 수 없다. 판매·차감 줄과
                가맹점마다의 합계가 든 파일을 준다. 줄을 고르는 조건이 이 초안과 같아 합이 맞는다.

                평범한 링크로 받는다 — 손님 정보가 없는 읽기라 버튼·스크립트를 거칠 이유가 없다.
              */}
              <a
                href={`/api/admin/settlements/export?period=${yearMonth}`}
                download
                className="inline-flex h-10 items-center rounded-sm border border-[var(--border-strong)] px-4 text-[13px] font-medium text-[var(--fg)] no-underline"
              >
                내역 CSV 내려받기
              </a>
              {canConfirm && closed && <CloseButton yearMonth={yearMonth} />}
            </div>
          </div>

          {drafts.length === 0 ? (
            <p className="py-12 text-center text-[13px] text-[var(--fg-muted)]">
              이 기간에 정산할 가맹점이 없습니다.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="정산 미리보기">
              <table className="data-table">
                <caption className="sr-only">{yearMonth} 가맹점별 정산 초안</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">가맹점</th>
                    <th scope="col" className="w-20 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">건수</th>
                    <th scope="col" className="w-32 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">확정 매출</th>
                    <th scope="col" className="w-32 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">수수료</th>
                    <th scope="col" className="w-32 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">환불</th>
                    <th scope="col" className="w-32 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">지급액</th>
                    <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                    {!actor.merchantId && (
                      <th scope="col" className="w-16 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">내역</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {drafts.map((d) => (
                    <tr key={d.merchantId} className="border-b border-[var(--surface-2)] last:border-0">
                      <td className="py-3 text-[13px]">
                        {d.merchantName}
                        <span className="ml-1.5 text-[11px] text-[var(--fg-muted)]">
                          수수료 {d.commissionPercent}%
                        </span>
                      </td>
                      <td className="tnum py-3 text-right text-[13px]">{d.orderCount}</td>
                      <td className="tnum py-3 text-right text-[13px]">{format(d.grossAmount)}</td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        −{format(d.commissionAmount)}
                      </td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        {d.refundAmount > 0 ? `−${format(d.refundAmount)}` : '—'}
                      </td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">
                        {format(d.netAmount)}
                      </td>
                      <td className="py-3 text-center">
                        {d.existingStatus ? (
                          <Badge tone={d.existingStatus === 'PAID' ? 'success' : 'neutral'}>
                            {SETTLEMENT_STATUS_LABEL[d.existingStatus]}
                          </Badge>
                        ) : (
                          <span className="text-[11px] text-[var(--fg-muted)]">미확정</span>
                        )}
                      </td>
                      {/*
                        운영진은 가맹점 하나만 따로 받아 그 가맹점에 보낼 수 있다. 이름 칸에 섞지 않고 칸을
                        따로 둔다 — 이름 칸에 링크 글자가 붙으면 낭독기가 "무어 수수료 12% 내역" 을 한 이름으로 읽는다.
                      */}
                      {!actor.merchantId && (
                        <td className="py-3 text-center">
                          {d.orderCount > 0 || d.refundAmount > 0 ? (
                            <a
                              href={`/api/admin/settlements/export?period=${yearMonth}&merchant=${d.merchantId}`}
                              download
                              aria-label={`${d.merchantName} ${yearMonth} 정산 내역 CSV 내려받기`}
                              className="text-[12px] text-[var(--fg-secondary)] underline underline-offset-2"
                            >
                              CSV
                            </a>
                          ) : (
                            <span className="text-[11px] text-[var(--fg-muted)]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={5} className="pt-3 text-right text-xs text-[var(--fg-secondary)]">
                      지급액 합계
                    </th>
                    <td className="tnum pt-3 text-right text-[15px] font-semibold">{format(total)}</td>
                    <td />
                    {!actor.merchantId && <td />}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="history-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="history-title" className="mb-4 text-base font-semibold">확정된 정산 내역</h2>
          {settlements.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
              확정된 정산 내역이 없습니다.
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="확정된 정산 내역">
              <table className="data-table">
                <caption className="sr-only">확정된 정산 내역</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">기간</th>
                    {!actor.merchantId && (
                      <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">가맹점</th>
                    )}
                    <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">매출</th>
                    <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">수수료</th>
                    <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">지급액</th>
                    <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                    {canPay && (
                      <th scope="col" className="w-24 pb-2.5 text-center text-xs text-[var(--fg-secondary)]">지급</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} className="border-b border-[var(--surface-2)] last:border-0">
                      <td className="tnum py-3 text-xs">
                        {dateFormat.format(s.periodStart)} ~ {endLabel(s.periodEnd)}
                      </td>
                      {!actor.merchantId && <td className="py-3 text-[13px]">{s.merchantName}</td>}
                      <td className="tnum py-3 text-right text-[13px]">{format(s.grossAmount)}</td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        −{format(s.commissionAmount)}
                      </td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">{format(s.netAmount)}</td>
                      <td className="py-3 text-center">
                        <Badge tone={s.status === 'PAID' ? 'success' : 'neutral'}>
                          {SETTLEMENT_STATUS_LABEL[s.status as SettlementStatus] ?? s.status}
                        </Badge>
                      </td>
                      {canPay && (
                        <td className="py-3 text-center">
                          {s.status === 'CONFIRMED' ? (
                            <PayButton
                              settlementId={s.id}
                              merchantName={s.merchantName}
                              disabledReason={s.netAmount < 0 ? '수동 처리' : undefined}
                            />
                          ) : (
                            <span className="text-[11px] text-[var(--fg-muted)]">—</span>
                          )}
                        </td>
                      )}
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
