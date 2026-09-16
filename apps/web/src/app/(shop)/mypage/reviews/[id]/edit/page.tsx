import Image from 'next/image';
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import { TrackedLink as Link } from '~/components/tracked-link';
import { REVIEW_REWARD } from '@shop/core';
import { formatNumber } from '@shop/i18n';
import { getMyReview } from '~/lib/queries/reviews';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { ReviewEditForm } from './review-edit-form';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('review.editTitle'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/**
 * 리뷰 수정.
 *
 * **고칠 문이 없으면 리뷰는 한 번 쓰고 끝나는 글이 된다.** 창구(PATCH)는 처음부터 있었는데 화면이 없어서, 오타 하나를
 * 고치려면 지우고 다시 쓰는 수밖에 없었다 — 그러면 도움돼요 표도 판매자 답글도 함께 사라진다.
 */
export default async function EditReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getViewer();
  const { id } = await params;
  if (!user) redirect(`/login?next=/mypage/reviews/${id}/edit`);

  const [review, t] = await Promise.all([getMyReview(user.id, id), getT()]);
  // 남의 글도, 운영진이 내린 글도 여기서는 없는 것과 같다
  if (!review) notFound();

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage/reviews" className="text-xs text-[var(--fg-muted)]">
            {t('my.reviews')}
          </Link>
        </nav>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t('review.editTitle')}</h1>
      </header>

      <article className="rounded-md border border-[var(--border)] p-6">
        <div className="flex gap-4 border-b border-[var(--surface-2)] pb-5">
          {review.imageUrl ? (
            <Image
              src={review.imageUrl} alt=""
              width={64} height={80}
              className="h-20 w-16 shrink-0 rounded-xs bg-[var(--surface-2)] object-cover"
            />
          ) : (
            <span aria-hidden="true" className="h-20 w-16 shrink-0 rounded-xs bg-ph-sand" />
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[11px] text-[var(--fg-muted)]">{review.brandName}</span>
            <h2 className="text-[15px] font-medium">
              <Link href={`/product/${review.productSlug}`} className="underline-offset-2 hover:underline">
                {review.productName}
              </Link>
            </h2>
            <span className="text-[12px] text-[var(--fg-secondary)]">{review.optionLabel}</span>
          </div>
        </div>

        {/*
          답글이 달린 글은 고치는 순간 그 답이 무엇에 대한 말인지 흐려진다. 막지는 않는다 — 판매자가 답했다고 해서
          글쓴이가 자기 글을 못 고칠 이유는 없다. 대신 그렇게 된다는 것을 미리 말한다.
        */}
        {/* 사진이 없는 글에만 말한다 — 이미 붙인 사람에게 더 준다고 말하면 거짓이 된다 */}
        {review.images.length === 0 && (
          <p className="mt-5 rounded-sm bg-[var(--surface)] px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
            {t('review.photoTopUp', {
              amount: formatNumber(t.locale, REVIEW_REWARD.photo - REVIEW_REWARD.text),
            })}
          </p>
        )}

        {review.replied && (
          <p className="mt-5 rounded-sm bg-[var(--surface)] px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
            {t('review.editRepliedNote')}
          </p>
        )}

        <div className="pt-5">
          <ReviewEditForm
            review={{
              id: review.id,
              rating: review.rating,
              content: review.content,
              sizeFit: review.sizeFit,
              height: review.height,
              weight: review.weight,
              images: review.images,
            }}
          />
        </div>
      </article>
    </div>
  );
}
