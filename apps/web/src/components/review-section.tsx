import { SIZE_FIT_LABEL, type SizeFit } from '@shop/core';
import type { PublicReview, ReviewSummary } from '~/lib/queries/reviews';
import { ReviewStars } from './review-stars';
import { ReviewActions } from './review-actions';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

/** 상품 상세의 리뷰 영역 */
export function ReviewSection({
  summary,
  reviews,
}: {
  summary: ReviewSummary;
  reviews: readonly PublicReview[];
}) {
  return (
    <section aria-labelledby="reviews-title" className="border-t border-[var(--border)] pt-10">
      <h2 id="reviews-title" className="text-lg font-semibold tracking-tight">
        리뷰 <span className="tnum text-[var(--fg-muted)]">{summary.total.toLocaleString('ko-KR')}</span>
      </h2>

      {summary.total === 0 ? (
        <p className="py-14 text-center text-[13px] text-[var(--fg-muted)]">
          아직 리뷰가 없습니다. 구매하신 뒤 첫 후기를 남겨 주세요.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr_240px]">
            <div className="flex flex-col items-center justify-center gap-1 rounded-md bg-[var(--surface)] p-6">
              <span className="tnum text-[40px] leading-none font-semibold">
                {summary.average?.toFixed(1) ?? '—'}
              </span>
              {summary.average !== undefined && <ReviewStars rating={summary.average} size="md" />}
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold text-[var(--fg-secondary)]">별점 분포</h3>
              <ul className="flex flex-col gap-1.5">
                {summary.breakdown.map((row) => (
                  <li key={row.rating} className="flex items-center gap-3">
                    <span className="tnum w-8 shrink-0 text-[12px] text-[var(--fg-muted)]">
                      {row.rating}점
                    </span>
                    <span
                      className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-2)]"
                      // 막대는 그림이고 옆의 숫자가 정보다
                      aria-hidden="true"
                    >
                      <span
                        className="block h-full rounded-full bg-warning-graphic"
                        style={{ width: `${row.percent}%` }}
                      />
                    </span>
                    <span className="tnum w-14 shrink-0 text-right text-[12px] text-[var(--fg-muted)]">
                      {row.count.toLocaleString('ko-KR')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {summary.sizeFit.some((s) => s.count > 0) && (
              <div>
                <h3 className="mb-3 text-xs font-semibold text-[var(--fg-secondary)]">사이즈</h3>
                <dl className="flex flex-col gap-2">
                  {summary.sizeFit.map((s) => (
                    <div key={s.fit} className="flex items-center justify-between gap-3">
                      <dt className="text-[12px] text-[var(--fg-secondary)]">
                        {SIZE_FIT_LABEL[s.fit]}
                      </dt>
                      <dd className="tnum text-[12px] font-medium">{s.percent}%</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          <ul className="mt-10 flex flex-col">
            {reviews.map((review) => (
              <li key={review.id} className="border-t border-[var(--surface-2)] py-6">
                <article>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ReviewStars rating={review.rating} />
                    <span className="text-[13px] font-medium">{review.authorName}</span>
                    <time
                      dateTime={review.createdAt.toISOString()}
                      className="text-[12px] text-[var(--fg-muted)]"
                    >
                      {dateFormat.format(review.createdAt)}
                    </time>
                    {review.isMine && <ReviewActions reviewId={review.id} />}
                  </div>

                  {(review.optionLabel || review.sizeFit || review.height) && (
                    <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">
                      {[
                        review.optionLabel,
                        review.sizeFit && SIZE_FIT_LABEL[review.sizeFit as SizeFit],
                        review.height && review.weight
                          ? `${review.height}cm · ${review.weight}kg`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}

                  <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-[var(--fg-secondary)]">
                    {review.content}
                  </p>

                  {review.imageUrls.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {review.imageUrls.map((url, i) => (
                        <li key={url}>
                          {/*
                            원본을 새 탭으로 연다. 확대 보기를 직접 만들면
                            포커스 가두기와 Esc 를 함께 다뤄야 하는데, 사진
                            한 장을 크게 보는 일에 그만한 장치가 필요하지 않다.
                          */}
                          <a href={url} target="_blank" rel="noreferrer">
                            <img
                              src={url}
                              /*
                                작성자가 대체 텍스트를 적지 않는다. 억지로
                                받으면 대부분 "사진" 이라고 적힌다. 대신 몇
                                번째 사진인지와 누구의 후기인지를 우리가 말해
                                준다 — 없는 것보다 낫고, 거짓을 적지도 않는다.
                              */
                              alt={`${review.authorName} 님의 후기 사진 ${i + 1}`}
                              loading="lazy"
                              className="h-24 w-24 rounded-sm border border-[var(--border)] object-cover"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
