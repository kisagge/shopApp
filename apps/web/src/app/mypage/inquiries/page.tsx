import type { Metadata } from 'next';
import { getViewer } from '~/lib/viewer';
import { redirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { formatDateTime } from '@shop/i18n';
import { getMyInquiries } from '~/lib/queries/inquiries';
import { getLocale, getT } from '~/lib/i18n/server';
import { TOPIC_KEY } from '~/lib/i18n/support';
import { NO_INDEX } from '~/lib/no-index';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('support.myInquiries'), ...NO_INDEX };
}

export default async function MyInquiriesPage() {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/inquiries');

  const [page, locale, t] = await Promise.all([
    getMyInquiries(user.id),
    getLocale(),
    getT(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
            {t('nav.mypage')}
          </Link>
        </nav>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">
          {t('support.myInquiries')}
        </h1>
      </header>

      {page.items.length === 0 ? (
        <p className="py-24 text-center text-[13px] text-[var(--fg-muted)]">
          {t('support.noInquiries')}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {page.items.map((row) => (
            <li key={row.id} className="rounded-md border border-[var(--border)] p-5">
              <article className="flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="text-[13px] font-medium">
                    {/*
                      상품 문의는 그 상품으로, 고객센터 문의는 갈래로 알려
                      준다. 어디에 물었는지가 보이지 않으면 답을 읽어도
                      무엇에 대한 답인지 알기 어렵다.
                    */}
                    {row.productSlug && row.productName ? (
                      <Link
                        href={`/product/${row.productSlug}`}
                        className="text-[var(--fg)] no-underline hover:underline"
                      >
                        {row.productName}
                      </Link>
                    ) : (
                      <span className="text-[var(--fg-secondary)]">
                        {row.topic ? t(TOPIC_KEY[row.topic]) : t('support.heading')}
                      </span>
                    )}
                  </h2>
                  <p className="flex items-center gap-2 text-[12px] text-[var(--fg-muted)]">
                    {row.isPrivate && <span>🔒</span>}
                    <span className={row.answeredAt ? 'text-success' : undefined}>
                      {row.answeredAt ? t('support.answered') : t('support.waiting')}
                    </span>
                    <time dateTime={row.createdAt.toISOString()}>
                      {formatDateTime(locale, row.createdAt)}
                    </time>
                  </p>
                </div>

                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{row.content}</p>

                {row.answer && (
                  <div className="rounded-sm bg-[var(--surface)] p-4">
                    <p className="text-[11px] font-medium text-[var(--fg-secondary)]">
                      {t('support.answer')}
                      {row.answeredAt && (
                        <time dateTime={row.answeredAt.toISOString()} className="ml-2 font-normal">
                          {formatDateTime(locale, row.answeredAt)}
                        </time>
                      )}
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                      {row.answer}
                    </p>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
