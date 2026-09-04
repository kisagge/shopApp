import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminInquiries } from '~/lib/queries/inquiries';
import { InquiryAnswerForm } from '~/components/admin/inquiry-answer-form';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '상품 문의' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul',
});

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const actor = await requireAdmin('inquiry:answer');
  const params = await searchParams;

  // 기본은 미답변이다. 이 화면은 목록이 아니라 처리할 일감이다.
  const unanswered = params.tab !== 'all';
  const page = await getAdminInquiries(actor, {
    unanswered,
    cursor: params.cursor || undefined,
  });

  const nextHref = page.nextCursor
    ? {
        pathname: '/admin/inquiries' as const,
        query: { ...(unanswered ? {} : { tab: 'all' }), cursor: page.nextCursor },
      }
    : null;

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">상품 문의</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {page.pending > 0 ? `답변 대기 ${page.pending}건` : '답변할 문의 없음'}
            {actor.merchantId && ' · 내 브랜드만'}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <nav aria-label="문의 상태" className="flex gap-1 border-b border-[var(--border)]">
          {[
            { key: 'pending', label: '답변 대기', current: unanswered, query: {} },
            { key: 'all', label: '전체', current: !unanswered, query: { tab: 'all' } },
          ].map((tab) => (
            <Link
              key={tab.key}
              href={{ pathname: '/admin/inquiries', query: tab.query }}
              aria-current={tab.current ? 'page' : undefined}
              className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] no-underline ${
                tab.current
                  ? 'border-[var(--brand)] font-medium text-[var(--fg)]'
                  : 'border-transparent text-[var(--fg-secondary)] hover:text-[var(--fg)]'
              }`}
            >
              {tab.label}
              {tab.key === 'pending' && page.pending > 0 && (
                <span className="ml-1.5 text-accent">{page.pending}</span>
              )}
            </Link>
          ))}
        </nav>

        {page.rows.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-20 text-center text-[13px] text-[var(--fg-muted)]">
            {unanswered ? '답변을 기다리는 문의가 없습니다.' : '문의가 없습니다.'}
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-3 p-0">
            {page.rows.map((row) => (
              <li key={row.id} className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-5">
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
                    <p className="flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
                      {row.isPrivate && <span>🔒 비공개</span>}
                      <span>{row.authorName}</span>
                      <time dateTime={row.createdAt.toISOString()}>
                        {dateFormat.format(row.createdAt)}
                      </time>
                    </p>
                  </div>

                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{row.content}</p>

                  {row.answer ? (
                    <div className="rounded-sm bg-[var(--surface)] p-4">
                      <p className="text-[11px] font-medium text-[var(--fg-secondary)]">
                        답변
                        {row.answeredAt && (
                          <time dateTime={row.answeredAt.toISOString()} className="ml-2 font-normal">
                            {dateFormat.format(row.answeredAt)}
                          </time>
                        )}
                      </p>
                      <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                        {row.answer}
                      </p>
                    </div>
                  ) : (
                    <InquiryAnswerForm inquiryId={row.id} productName={row.productName} />
                  )}
                </article>
              </li>
            ))}
          </ul>
        )}

        <Pager href={nextHref} label="이전 문의 더 보기" hasRows={page.rows.length > 0} />
      </div>
    </>
  );
}
