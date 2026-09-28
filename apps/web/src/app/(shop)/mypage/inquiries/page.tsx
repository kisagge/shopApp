import type { Metadata } from 'next';
import { getViewer } from '~/lib/viewer';
import { redirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { formatDateTime } from '@shop/i18n';
import { getMyInquiries, MY_INQUIRY_PAGE_SIZE } from '~/lib/queries/inquiries';
import { PageNav, pageNavLabels } from '~/components/page-nav';
import { getLocale, getT } from '~/lib/i18n/server';
import { TOPIC_KEY } from '~/lib/i18n/support';
import { NO_INDEX } from '~/lib/no-index';
import { InquiryPhotos } from '~/components/inquiry-photos';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('support.myInquiries'), ...NO_INDEX };
}

export default async function MyInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/inquiries');
  const { page: pageParam } = await searchParams;
  const pageNo = Math.max(Number.parseInt(pageParam ?? '1', 10) || 1, 1);

  const [page, locale, t] = await Promise.all([
    getMyInquiries(user.id, pageNo),
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
        /*
          **빈 목록에 다음 걸음을 둔다.** 문의하러 들어왔다가 "없습니다" 만 보고 되돌아 나가야 했다 —
          문의를 남기는 자리는 다른 화면에 있고 여기서 가는 길이 없었다(찜 목록은 진작 그 길을 갖고 있다).
        */
        <div className="flex flex-col items-center gap-3 py-24">
          <p className="text-[13px] text-[var(--fg-muted)]">{t('support.noInquiries')}</p>
          <Link href="/support/ask" className="mt-2 inline-flex h-11 items-center rounded-sm border border-[var(--border-strong)] px-5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]">
            {t('support.askHeading')}
          </Link>
        </div>
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
                    {/*
                      **자물쇠 하나만 있으면 아무 말도 안 한다.** 그림은 텍스트 노드라 axe 에도 안 걸리는데,
                      낭독기는 이모지 이름을 로케일에 따라 영어로 읽거나 아무 말도 안 한다. 그리고 번역도 안 된다.
                      같은 뜻을 다른 두 화면은 이미 글자로 적고 있었다(inquiry-section · 운영 문의 목록).
                    */}
                    {row.isPrivate && (
                      <span>
                        <span aria-hidden="true">🔒</span> {t('inq.private')}
                      </span>
                    )}
                    <span className={row.answeredAt ? 'text-success' : undefined}>
                      {row.answeredAt ? t('support.answered') : t('support.waiting')}
                    </span>
                    <time dateTime={row.createdAt.toISOString()}>
                      {formatDateTime(locale, row.createdAt)}
                    </time>
                  </p>
                </div>

                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{row.content}</p>

                <InquiryPhotos
                  urls={row.imageUrls}
                  listLabel={t('support.photosAttached')}
                  altOf={(index) => t('support.photoAlt', { index })}
                  labelOf={(index) => t('support.photoOpen', { index })}
                />

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
      <div className="mt-8">
        <PageNav
          page={pageNo}
          total={page.total}
          pageSize={MY_INQUIRY_PAGE_SIZE}
          label={t('pager.label')}
          labels={pageNavLabels(t)}
          hrefOf={(n) => ({ pathname: '/mypage/inquiries', ...(n === 1 ? {} : { query: { page: String(n) } }) })}
        />
      </div>
    </div>
  );
}
