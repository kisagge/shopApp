import Image from 'next/image';
import { getViewer } from '~/lib/viewer';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { getMyReviews, getReviewableItems } from '~/lib/queries/reviews';
import { ReviewForm } from './review-form';
import { ReviewStars } from '~/components/review-stars';
import { ReviewActions } from '~/components/review-actions';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.reviews'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

/**
 * 내 리뷰.
 *
 * **쓸 것과 쓴 것이 한 자리에 있다.** 리뷰를 쓰는 사람과 고치는 사람은 같은 사람이고, 찾는 자리도 같다 — 쓴 글을 다시 보려면
 * 그 상품 화면에 들어가 목록에서 자기 글을 찾아내야 했다.
 */
export default async function MyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; edited?: string }>;
}) {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/reviews');

  const [items, mine, t, params] = await Promise.all([
    getReviewableItems(user.id),
    getMyReviews(user.id),
    getT(),
    searchParams,
  ]);
  // 방금 등록한 뒤 — 폼은 목록에서 빠져 사라지므로 결과는 화면이 남긴다(review-form)
  const saved = params.saved === '1';
  // 고치고 돌아온 뒤. 고친 화면은 떠나고 없으므로 여기서 말한다
  const edited = params.edited === '1';

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
            {t('nav.mypage')}
          </Link>
        </nav>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t('my.reviews')}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {t('my.reviewLead')}
        </p>
      </header>

      {(saved || edited) && (
        <p role="status" className="mb-6 rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
          {t(saved ? 'review.saved' : 'review.editSaved')}
        </p>
      )}

      <section aria-labelledby="reviews-to-write">
        <h2 id="reviews-to-write" className="mb-5 text-[15px] font-semibold">
          {t('my.reviewToWrite')}
        </h2>

        {items.length === 0 ? (
          <p className="py-14 text-center text-[13px] text-[var(--fg-muted)]">
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
                      <h3 className="text-[15px] font-medium">{item.productName}</h3>
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
      </section>

      <section aria-labelledby="reviews-written" className="mt-14">
        <h2 id="reviews-written" className="mb-5 text-[15px] font-semibold">
          {t('my.reviewsWritten')} <span className="tnum text-[var(--fg-muted)]">{mine.length}</span>
        </h2>

        {mine.length === 0 ? (
          <p className="py-14 text-center text-[13px] text-[var(--fg-muted)]">
            {t('my.reviewsWrittenNone')}
          </p>
        ) : (
          <ul className="flex flex-col">
            {mine.map((review) => (
              <li key={review.id} className="border-t border-[var(--border)] py-6">
                <article>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ReviewStars rating={review.rating} />
                    <time
                      dateTime={review.createdAt.toISOString()}
                      className="text-[12px] text-[var(--fg-muted)]"
                    >
                      {dateFormat.format(review.createdAt)}
                    </time>
                    {/* 고쳤다는 사실을 글쓴이에게도 적어 둔다 — 손님 화면에 그렇게 보인다 */}
                    {review.editedAt && (
                      <span className="text-[11px] text-[var(--fg-muted)]">{t('review.edited')}</span>
                    )}
                  </div>

                  <h3 className="mt-2 text-[14px] font-medium">
                    <Link href={`/product/${review.productSlug}`} className="underline-offset-2 hover:underline">
                      {review.productName}
                    </Link>
                    <span className="ml-2 text-[12px] font-normal text-[var(--fg-muted)]">
                      {review.optionLabel}
                    </span>
                  </h3>

                  <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed whitespace-pre-line text-[var(--fg-secondary)]">
                    {review.content}
                  </p>

                  {review.images.length > 0 && (
                    <p className="mt-2 text-[11px] text-[var(--fg-muted)]">
                      {t('review.photoCount', { count: review.images.length })}
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <Link
                      href={`/mypage/reviews/${review.id}/edit`}
                      className="text-[11px] underline underline-offset-2"
                    >
                      {t('review.edit')}
                    </Link>
                    {/* 고치기는 바로 옆에 이미 있다 */}
                    <ReviewActions reviewId={review.id} showEdit={false} />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
