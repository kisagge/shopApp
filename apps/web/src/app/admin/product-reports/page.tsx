import type { Metadata } from 'next';
import Link from 'next/link';
import { PRODUCT_REPORT_REASON_KEY } from '~/lib/i18n/enum-labels';
import { requireAdmin } from '~/lib/admin/guard';
import { getProductReportQueue, type ProductReportTab } from '~/lib/queries/admin/product-reports';
import { ReportActions } from './report-actions';

export const metadata: Metadata = { title: '상품 신고' };
export const dynamic = 'force-dynamic';

/**
 * 상품 신고 대기줄.
 *
 * **운영진만 본다**(`product:moderate`). 신고의 대상이 파는 쪽이라, 그 쪽이 자기 건을
 * 닫을 수 있으면 신고가 운영진에게 닿지 않는다.
 *
 * 줄 순서는 조회가 정한다 — 점수가 높은 쪽부터, 같으면 오래 기다린 쪽부터. 점수는 사유의
 * 무게(법·안전이 가장 무겁다)와 **사유가 갈린 수**로 매긴다.
 */

/**
 * 이름표는 운영 화면이라 한국어다.
 *
 * 손님 화면은 세 나라 말로 나가므로 사전을 쓰는데(`PRODUCT_REPORT_REASON_KEY`), 여기서는
 * 그 열쇠를 한국어 사전으로 읽을 수 없다 — 운영 화면에는 사전 제공자가 없다. 그래서 짧은
 * 표를 둔다. **열거형에서 열쇠를 만들므로 사유가 늘면 타입이 먼저 걸린다.**
 */
const REASON_LABEL: Readonly<Record<keyof typeof PRODUCT_REPORT_REASON_KEY, string>> = {
  COUNTERFEIT: '정품 아님',
  PROHIBITED: '금지 품목',
  WRONG_INFO: '설명과 다름',
  UNSAFE: '안전 문제',
  OTHER: '기타',
};

const TABS: readonly { readonly tab: ProductReportTab; readonly label: string }[] = [
  { tab: 'open', label: '처리 대기' },
  { tab: 'done', label: '처리한 것' },
];

const day = (value: Date) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(value);

export default async function AdminProductReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const actor = await requireAdmin('product:moderate');

  const raw = (await searchParams).tab;
  const asked = Array.isArray(raw) ? raw[0] : raw;
  const tab: ProductReportTab = asked === 'done' ? 'done' : 'open';

  const { rows, truncated } = await getProductReportQueue(actor, { tab });

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">상품 신고</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            상품 <span className="tnum">{rows.length.toLocaleString('ko-KR')}</span>개
          </p>
        </div>
        <nav aria-label="보기" className="flex gap-1.5">
          {TABS.map((item) => (
            <Link
              key={item.tab}
              href={`/admin/product-reports?tab=${item.tab}`}
              aria-current={item.tab === tab ? 'page' : undefined}
              className={`rounded-sm px-3 py-1.5 text-[13px] ${
                item.tab === tab
                  ? 'bg-[var(--fg)] text-[var(--bg)]'
                  : 'text-[var(--fg-secondary)] hover:bg-[var(--surface)]'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section
          aria-labelledby="queue-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="queue-title" className="mb-1 text-base font-semibold">
            {tab === 'open' ? '처리 대기' : '처리한 것'}
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed text-[var(--fg-secondary)]">
            {tab === 'open'
              ? '급한 것부터 세웁니다 — 사유의 무게(금지 품목·안전이 가장 무겁습니다)와 사유가 갈린 수로 매깁니다. 같은 점수면 오래 기다린 쪽이 먼저입니다.'
              : '최근에 처리한 것부터 보여 줍니다.'}
          </p>

          {truncated && (
            <p className="mb-3 text-[12px] text-[var(--fg-secondary)]">
              오래 기다린 신고부터 일부만 보여 줍니다. 처리하면 다음 것이 올라옵니다.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
              {tab === 'open' ? '처리할 신고가 없습니다.' : '아직 처리한 신고가 없습니다.'}
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="신고된 상품">
              <table className="data-table">
                <caption className="sr-only">신고된 상품</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">상품</th>
                    <th scope="col" className="pb-2.5 text-left text-xs text-[var(--fg-secondary)]">신고</th>
                    <th scope="col" className="w-20 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">점수</th>
                    <th scope="col" className="w-56 pb-2.5 text-right text-xs text-[var(--fg-secondary)]">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.productId} className="border-b border-[var(--surface-2)] last:border-0 align-top">
                      <td className="py-3">
                        <Link
                          href={`/product/${row.productSlug}`}
                          className="text-[13px] underline underline-offset-2"
                        >
                          {row.productName}
                        </Link>
                        {row.archived && (
                          <span className="ml-1.5 text-[11px] text-[var(--fg-muted)]">보관됨</span>
                        )}
                      </td>
                      <td className="py-3">
                        <ul className="flex flex-col gap-1.5">
                          {row.reports.map((report) => (
                            <li key={report.id} className="text-[12px]">
                              <span className="font-medium">{REASON_LABEL[report.reason]}</span>
                              <span className="text-[var(--fg-muted)]"> · {report.reporterName}</span>
                              <time
                                dateTime={report.createdAt.toISOString()}
                                className="tnum text-[var(--fg-muted)]"
                              >
                                {' · '}{day(report.createdAt)}
                              </time>
                              {report.detail && (
                                <span className="block text-[var(--fg-secondary)]">{report.detail}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="tnum py-3 text-right text-[13px] font-semibold">
                        {row.priority.toLocaleString('ko-KR')}
                      </td>
                      <td className="py-3 text-right">
                        {row.openReports > 0 ? (
                          <ReportActions productId={row.productId} productName={row.productName} />
                        ) : (
                          <span className="text-[12px] text-[var(--fg-muted)]">
                            {row.reports[0]?.resolution === 'archived' ? '보관으로 처리' : '문제없음으로 처리'}
                          </span>
                        )}
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
