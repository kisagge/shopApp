import Image from 'next/image';
import { getViewer } from '~/lib/viewer';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { getReviewableItems } from '~/lib/queries/reviews';
import { ReviewForm } from './review-form';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.writeReview'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

export default async function WriteReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/reviews');

  const [items, t, params] = await Promise.all([getReviewableItems(user.id), getT(), searchParams]);
  // 방금 등록한 뒤 — 폼은 목록에서 빠져 사라지므로 결과는 화면이 남긴다(review-form)
  const saved = params.saved === '1';

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
            {t('nav.mypage')}
          </Link>
        </nav>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t('my.writeReview')}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {t('my.reviewLead')}
        </p>
      </header>

      {saved && (
        <p role="status" className="mb-6 rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
          {t('review.saved')}
        </p>
      )}

      {items.length === 0 ? (
        <p className="py-24 text-center text-[13px] text-[var(--fg-muted)]">
          {t('my.reviewNone')}
        </p>
      ) : (
        <ul className="flex flex-col gap-8">
          {items.map((item) => (
            <li key={item.orderItemId} className="rounded-md border border-[var(--border)] p-6">
              <article>
                <div className="flex gap-4 border-b border-[var(--surface-2)] pb-5">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl} alt=""
                      // 크기가 고정이라 sizes 를 주지 않는다 — 1x·2x 두 벌만 만들어진다
                      width={64} height={80}
                      className="h-20 w-16 shrink-0 rounded-xs bg-[var(--surface-2)] object-cover"
                    />
                  ) : (
                    <span aria-hidden="true" className="h-20 w-16 shrink-0 rounded-xs bg-ph-sand" />
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] text-[var(--fg-muted)]">{item.brandName}</span>
                    <h2 className="text-[15px] font-medium">{item.productName}</h2>
                    <span className="text-[12px] text-[var(--fg-secondary)]">{item.optionLabel}</span>
                    {item.deliveredAt && (
                      <span className="text-[11px] text-[var(--fg-muted)]">
                        <time dateTime={item.deliveredAt.toISOString()}>
                          {dateFormat.format(item.deliveredAt)}
                        </time>{' '}
                        {t('my.delivered')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-5">
                  <ReviewForm
                    target={{
                      orderItemId: item.orderItemId,
                      productName: item.productName,
                      brandName: item.brandName,
                      optionLabel: item.optionLabel,
                      imageUrl: item.imageUrl,
                    }}
                  />
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
