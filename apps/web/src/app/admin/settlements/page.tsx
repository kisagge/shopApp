import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import {
  format, won, hasPermission, previousYearMonth, settlementPeriod, isClosedPeriod,
  isSettlementBank, SETTLEMENT_BANK_LABEL, SETTLEMENT_STATUS_LABEL, SettlementError, type SettlementStatus,
} from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getSettlements, SETTLEMENT_PAGE_SIZE } from '~/lib/queries/admin/settlements';
import { PageNav } from '~/components/page-nav';
import { previewSettlements } from '~/lib/admin/close-settlement';
import { CloseButton, HoldButton, PayButton } from './settlement-actions';
import { adminDate } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '정산' };
export const dynamic = 'force-dynamic';

/**
 * 은행 이름. 운영 화면은 한국어 한 벌이라 사전을 거치지 않는다 — 여기서는 값이 그대로 뜨는 것만 막는다.
 * 모르는 값이면 코드를 그대로 적는다: 지어내는 것보다 낫다.
 */
function bankLabel(bank: string): string {
  return isSettlementBank(bank) ? SETTLEMENT_BANK_LABEL[bank] : bank;
}

/** 기간 끝은 다음 달 1일 00:00 이라 그대로 찍으면 하루 뒤로 보인다 */
function endLabel(end: Date): string {
  return adminDate.format(new Date(end.getTime() - 1));
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; page?: string }>;
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

  const pageNo = Math.max(Number.parseInt(params.page ?? '1', 10) || 1, 1);
  const [drafts, history] = await Promise.all([
    previewSettlements(actor, yearMonth),
    getSettlements(actor, pageNo),
  ]);
  const settlements = history.rows;
  const anyCarry = drafts.some((d) => d.carriedAmount !== 0);

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
                {adminDate.format(period.start)} ~ {endLabel(period.end)} · 구매확정 기준
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
                    {anyCarry && (
                      <th scope="col" className="w-32 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">이월 차감</th>
                    )}
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
                      {/*
                        **앞선 달에서 넘어온 빚.** 환불이 매출을 넘은 달은 지급할 것이 없어 이 달에서 뺀다 — 칸이
                        없으면 지급액이 왜 매출·수수료·환불로 계산한 것보다 적은지 알 길이 없다.
                      */}
                      {anyCarry && (
                        <td className="tnum py-3 text-right text-[13px] text-accent">
                          {d.carriedAmount < 0 ? `−${format(won(Math.abs(d.carriedAmount)))}` : '—'}
                        </td>
                      )}
                      <td className="tnum py-3 text-right text-[13px] font-semibold">
                        {format(d.netAmount)}
                        {d.netAmount < 0 && (
                          <span className="block text-[11px] font-normal text-[var(--fg-muted)]">다음 달에서 뺍니다</span>
                        )}
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
                    <th scope="row" colSpan={anyCarry ? 6 : 5} className="pt-3 text-right text-xs text-[var(--fg-secondary)]">
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
                    <th scope="col" className="pb-2.5 text-right text-xs text-[var(--fg-secondary)]">환불·이월</th>
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
                        {adminDate.format(s.periodStart)} ~ {endLabel(s.periodEnd)}
                      </td>
                      {!actor.merchantId && (
                        <td className="py-3 text-[13px]">
                          {s.merchantName}
                          {/*
                            **보낼 곳을 곁에 적는다.** 지급은 되돌릴 수 없는 단추인데, 그것을 누르는 화면이 돈이 어디로
                            가는지 말하지 않고 있었다. 번호는 뒤 네 자리만 — 맞는지 가리기에는 그것으로 충분하다.
                          */}
                          <span className="tnum block text-[11px] text-[var(--fg-muted)]">
                            {s.account
                              ? `${bankLabel(s.account.bank)} ${s.account.tail} · ${s.account.holder}`
                              : '정산 계좌 미등록'}
                          </span>
                        </td>
                      )}
                      <td className="tnum py-3 text-right text-[13px]">{format(s.grossAmount)}</td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        −{format(s.commissionAmount)}
                        {/* **그때의 요율이다.** 요율을 바꿔도 확정된 이 숫자는 그대로다 */}
                        <span className="block text-[11px] text-[var(--fg-muted)]">
                          {s.commissionPercent}%
                        </span>
                      </td>
                      <td className="tnum py-3 text-right text-[13px] text-accent">
                        {s.refundAmount > 0 ? `−${format(s.refundAmount)}` : '—'}
                        {s.carriedAmount < 0 && (
                          <span className="block text-[11px]">이월 −{format(won(Math.abs(s.carriedAmount)))}</span>
                        )}
                      </td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">{format(s.netAmount)}</td>
                      <td className="py-3 text-center">
                        <Badge tone={s.status === 'PAID' ? 'success' : 'neutral'}>
                          {SETTLEMENT_STATUS_LABEL[s.status as SettlementStatus] ?? s.status}
                        </Badge>
                        {/* 어느 달이 떠안았는지 — 넘긴 빚이 어디서 빠졌는지 맞춰 볼 수 있게 */}
                        {/* 왜 멈췄는지 — 가맹점도 이 화면에서 본다 */}
                        {s.heldReason && (
                          <span className="mt-1 block max-w-48 text-[11px] text-warning">{s.heldReason}</span>
                        )}
                        {s.carriedIntoStart && (
                          <span className="tnum mt-1 block text-[11px] text-[var(--fg-muted)]">
                            {s.carriedIntoStart.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' })} 정산에서 차감
                          </span>
                        )}
                      </td>
                      {canPay && (
                        <td className="py-3 text-center">
                          {s.status === 'CONFIRMED' || s.status === 'HELD' ? (
                            <>
                            {s.status === 'CONFIRMED' && (
                            <PayButton
                              settlementId={s.id}
                              merchantName={s.merchantName}
                              /*
                                계좌가 없으면 누를 수 없다. 서버도 막지만(close-settlement 의 NO_ACCOUNT),
                                눌러 보고 나서 거절당하는 화면은 사람을 두 번 헛되게 한다.
                              */
                              disabledReason={
                                s.netAmount < 0 ? '다음 달 차감' : s.account === null ? '계좌 없음' : undefined
                              }
                            />
                            )}
                            {/* 음수 달은 지급할 것이 없어 보류할 것도 없다 — 다음 확정에서 넘어간다 */}
                            {s.netAmount >= 0 && (
                              <HoldButton settlementId={s.id} merchantName={s.merchantName} held={s.status === 'HELD'} />
                            )}
                            </>
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
          <div className="mt-5">
            <PageNav
              page={pageNo}
              total={history.total}
              pageSize={SETTLEMENT_PAGE_SIZE}
              hrefOf={(n) => ({
                pathname: '/admin/settlements',
                query: { ...(params.period ? { period: yearMonth } : {}), ...(n === 1 ? {} : { page: String(n) }) },
              })}
            />
          </div>
        </section>
      </div>
    </>
  );
}
