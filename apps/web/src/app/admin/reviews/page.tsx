import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MODERATION_STATE_LABEL, hasPermission, type ModerationState,
} from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import {
  getAdminReviews, isReviewTab, REVIEW_TAB, REVIEW_TAB_LABEL, type ReviewTab,
} from '~/lib/queries/admin-reviews';
import { ReviewModeration } from '~/components/admin/review-moderation';
import { Pager } from '../pager';
import { getT } from '~/lib/i18n/server';
import { REPORT_REASON_KEY } from '~/lib/i18n/enum-labels';

export const metadata: Metadata = { title: '리뷰 관리' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

const STATE_STYLE: Readonly<Record<ModerationState, string>> = {
  reported: 'bg-accent/12 text-accent',
  removed: 'bg-[var(--surface-2)] text-[var(--fg-muted)]',
  kept: 'bg-[var(--surface-2)] text-[var(--fg-secondary)]',
  clean: 'bg-[var(--surface-2)] text-[var(--fg-secondary)]',
};

interface SearchParams {
  readonly tab?: string;
  readonly q?: string;
  readonly cursor?: string;
}

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  /*
   * **읽는 것은 가맹점도 한다.** 조회는 `review:read` 로 열고, 내리기·되살리기
   * 단추는 아래에서 `review:moderate` 를 가진 사람에게만 세운다. 무엇을 보는지는
   * 조회 쪽이 `merchantScope` 로 좁힌다 — 여기서 거르지 않는다.
   */
  const actor = await requireAdmin('review:read');
  const canModerate = hasPermission(actor, 'review:moderate');
  const t = await getT();
  const params = await searchParams;

  /*
   * **처리 대기는 조치하는 사람의 일감이다.** 내릴 수 없는 사람에게 그 줄을
   * 보여 주면 할 일처럼 보이는데 할 수 있는 것이 없다. 가맹점은 전체에서
   * 시작하고, 그 탭 자체를 세우지 않는다.
   */
  const tabs: readonly ReviewTab[] = canModerate
    ? REVIEW_TAB
    : REVIEW_TAB.filter((t) => t !== 'reported');
  const asked: ReviewTab = isReviewTab(params.tab) ? params.tab : 'reported';
  const tab: ReviewTab = tabs.includes(asked) ? asked : tabs[0]!;
  const q = params.q?.trim() || undefined;

  const page = await getAdminReviews(actor, {
    tab,
    q,
    cursor: params.cursor || undefined,
  });

  const nextHref = page.nextCursor
    ? {
        pathname: '/admin/reviews' as const,
        query: { tab, ...(q ? { q } : {}), cursor: page.nextCursor },
      }
    : null;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">리뷰 관리</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {canModerate
              ? page.pending > 0
                ? `처리 대기 ${page.pending}건`
                : '처리할 신고 없음'
              : '내 상품에 달린 평입니다 — 내리는 것은 운영진이 합니다'}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-8">
        {/* 탭은 링크다. 주소에 남아야 공유하고 뒤로 갈 수 있다. */}
        <nav aria-label="리뷰 상태" className="flex gap-1 border-b border-[var(--border)]">
          {tabs.map((t) => {
            const current = t === tab;
            return (
              <Link
                key={t}
                href={{ pathname: '/admin/reviews', query: { tab: t, ...(q ? { q } : {}) } }}
                aria-current={current ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] no-underline ${
                  current
                    ? 'border-[var(--brand)] font-medium text-[var(--fg)]'
                    : 'border-transparent text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                }`}
              >
                {REVIEW_TAB_LABEL[t]}
                {t === 'reported' && page.pending > 0 && (
                  <span className="ml-1.5 text-accent">{page.pending}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <form method="get" action="/admin/reviews" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value={tab} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-q" className="text-[11px] font-medium text-[var(--fg-secondary)]">
              상품명 또는 작성자
            </label>
            <input
              id="review-q"
              name="q"
              type="search"
              defaultValue={q ?? ''}
              placeholder="예: 오버사이즈 코트"
              className="h-10 w-72 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>
          <button
            type="submit"
            className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
          >
            검색
          </button>
          {q && (
            <Link
              href={{ pathname: '/admin/reviews', query: { tab } }}
              className="flex h-10 items-center px-2 text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
            >
              검색 해제
            </Link>
          )}
        </form>

        {page.capped && (
          <p role="status" className="rounded-sm bg-accent/10 px-4 py-3 text-[12px] text-accent">
            대기 중인 신고가 상한(200건)을 넘었습니다. 우선순위가 높은 200건만 보여 줍니다 —
            처리하면 나머지가 올라옵니다.
          </p>
        )}

        {page.rows.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-20 text-center text-[13px] text-[var(--fg-muted)]">
            {tab === 'reported'
              ? '처리할 신고가 없습니다.'
              : q
                ? '조건에 맞는 리뷰가 없습니다.'
                : '리뷰가 없습니다.'}
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {page.rows.map((row) => (
              <li
                key={row.id}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-5"
              >
                <article className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="text-[14px] font-medium">
                      <Link
                        href={`/admin/products/${row.productId}`}
                        className="text-[var(--fg)] no-underline hover:underline"
                      >
                        {row.productName}
                      </Link>
                    </h2>
                    <span
                      className={`rounded-sm px-2 py-0.5 text-[11px] ${STATE_STYLE[row.state]}`}
                    >
                      {MODERATION_STATE_LABEL[row.state]}
                    </span>
                  </div>

                  <p className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--fg-secondary)]">
                    <span aria-label={`별점 ${row.rating}점`}>
                      <span aria-hidden="true">{'★'.repeat(row.rating)}</span>
                      <span aria-hidden="true" className="text-[var(--fg-muted)]">
                        {'★'.repeat(5 - row.rating)}
                      </span>
                    </span>
                    <span>{row.authorName}</span>
                    <time dateTime={row.createdAt.toISOString()}>
                      {dateFormat.format(row.createdAt)}
                    </time>
                    {row.imageCount > 0 && <span>사진 {row.imageCount}장</span>}
                  </p>

                  {/* 원문을 자르지 않는다 — 자른 글로는 내릴지 말지 판단할 수 없다 */}
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{row.content}</p>

                  {row.reports.length > 0 && (
                    <details className="rounded-sm bg-[var(--surface)] px-4 py-3">
                      <summary className="cursor-pointer text-[12px] font-medium">
                        신고 {row.reports.length}건
                        {row.openReports > 0 && (
                          <span className="text-accent"> · 대기 {row.openReports}건</span>
                        )}
                      </summary>
                      <ul className="mt-3 flex list-none flex-col gap-2.5 p-0">
                        {row.reports.map((report) => (
                          <li key={report.id} className="text-[12px]">
                            <p className="flex flex-wrap items-baseline gap-2">
                              <b className="font-medium">{t(REPORT_REASON_KEY[report.reason])}</b>
                              <span className="text-[var(--fg-muted)]">{report.reporterName}</span>
                              <time
                                dateTime={report.createdAt.toISOString()}
                                className="text-[var(--fg-muted)]"
                              >
                                {dateFormat.format(report.createdAt)}
                              </time>
                              {report.resolvedAt && (
                                <span className="text-[var(--fg-muted)]">
                                  · {report.resolution === 'removed' ? '내림' : '문제없음'}
                                </span>
                              )}
                            </p>
                            {report.detail && (
                              <p className="mt-0.5 text-[var(--fg-secondary)]">{report.detail}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  {canModerate && (
                    <ReviewModeration
                      reviewId={row.id}
                      removed={row.state === 'removed'}
                      openReports={row.openReports}
                    />
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}

        <Pager href={nextHref} label="이전 리뷰 더 보기" hasRows={page.rows.length > 0 && tab !== 'reported'} />
      </div>
    </>
  );
}
