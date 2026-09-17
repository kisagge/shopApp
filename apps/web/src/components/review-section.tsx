import type { ReactNode } from 'react';
import Image from 'next/image';
import { isBlurDataUrl } from '@shop/core';
import type { SizeFit } from '@shop/core';
import type { PublicReview, ReviewSummary } from '~/lib/queries/reviews';
import { ReviewStars } from './review-stars';
import { ReviewActions } from './review-actions';
import { ReviewReport } from './review-report';
import { ReviewHelpful } from './review-helpful';
import { formatDate, type Translator } from '@shop/i18n';


/** 상품 상세의 리뷰 영역 */
export function ReviewSection({
  summary,
  reviews,
  sortTabs,
  loggedIn = false,
  sizeFitLabel = (fit) => fit,
  t,
}: {
  summary: ReviewSummary;
  reviews: readonly PublicReview[];
  /**
   * 정렬 줄.
   *
   * 여기서 직접 만들지 않고 받아 끼운다 — 그러려면 이 조각이 요청의 언어를
   * 알아야 하고, 그 순간 서버 컴포넌트가 되어 테스트에서 그릴 수 없다.
   * 찜 버튼을 ProductCard 에 끼워 넣는 것과 같은 결이다.
   */
  sortTabs?: ReactNode;
  /** 도움돼요를 누를 수 있는 사람인지 판단하는 데 쓴다 */
  loggedIn?: boolean;
  /**
   * 사이즈 표현의 이름표.
   *
   * 이 조각은 요청의 언어를 몰라야 테스트에서 그릴 수 있다. 정렬 줄을
   * 받아 끼우는 것과 같은 이유로, 이름 붙이는 일도 부르는 쪽이 한다.
   */
  sizeFitLabel?: (fit: SizeFit) => string;
  /**
   * 문구 사전.
   *
   * 이 조각은 요청의 언어를 몰라야 테스트에서 그릴 수 있다 — 정렬 줄을
   * 받아 끼우는 것과 같은 이유로 부르는 쪽이 넘긴다.
   */
  t: Translator;
}) {
  return (
    <section aria-labelledby="reviews-title" className="border-t border-[var(--border)] pt-10">
      <h2 id="reviews-title" className="text-lg font-semibold tracking-tight">
        {t('review.heading')}{' '}
        <span className="tnum text-[var(--fg-muted)]">{summary.total}</span>
      </h2>

      {summary.total === 0 ? (
        <p className="py-14 text-center text-[13px] text-[var(--fg-muted)]">
          {t('review.none')}
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[220px_minmax(0,1fr)_240px]">
            <div className="flex flex-col items-center justify-center gap-1 rounded-md bg-[var(--surface)] p-6">
              <span className="tnum text-[40px] leading-none font-semibold">
                {summary.average?.toFixed(1) ?? '—'}
              </span>
              {summary.average !== undefined && <ReviewStars rating={summary.average} size="md" />}
            </div>

            <div>
              <h3 className="mb-3 text-xs font-semibold text-[var(--fg-secondary)]">
                {t('review.breakdown')}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {summary.breakdown.map((row) => (
                  <li key={row.rating} className="flex items-center gap-3">
                    <span className="tnum w-8 shrink-0 text-[12px] text-[var(--fg-muted)]">
                      {t('review.starCount', { rating: row.rating })}
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
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {summary.sizeFit.some((s) => s.count > 0) && (
              <div>
                <h3 className="mb-3 text-xs font-semibold text-[var(--fg-secondary)]">
                  {t('review.sizeHeading')}
                </h3>
                <dl className="flex flex-col gap-2">
                  {summary.sizeFit.map((s) => (
                    <div key={s.fit} className="flex items-center justify-between gap-3">
                      <dt className="text-[12px] text-[var(--fg-secondary)]">
                        {sizeFitLabel(s.fit)}
                      </dt>
                      <dd className="tnum text-[12px] font-medium">{s.percent}%</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {sortTabs}

          <ul className="flex flex-col">
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
                      {formatDate(t.locale, review.createdAt)}
                    </time>
                    {/*
                      고쳐진 글이라고 적는다. 판매자 답글이 달린 뒤에 원문이 바뀌면 답글이 엉뚱해 보이는데,
                      표시가 없으면 읽는 사람은 그 이유를 알 길이 없다 — 답글 쪽에 이미 같은 표시가 있다.
                    */}
                    {review.editedAt && (
                      <span className="text-[11px] text-[var(--fg-muted)]">{t('review.edited')}</span>
                    )}
                    {review.isMine && <ReviewActions reviewId={review.id} />}
                    {review.canReport && (
                      <ReviewReport reviewId={review.id} alreadyReported={review.reportedByMe} />
                    )}
                  </div>

                  {(review.optionLabel || review.sizeFit || review.height) && (
                    <p className="mt-1.5 text-[11px] text-[var(--fg-muted)]">
                      {[
                        review.optionLabel,
                        review.sizeFit && sizeFitLabel(review.sizeFit as SizeFit),
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

                  {/*
                    판매자 답글은 리뷰 **안에** 둔다 — 어느 글에 한 답인지 떨어져 있으면 모른다. 제목으로 누구의 말인지
                    밝히고, 고쳐졌으면 글로 적는다.
                  */}
                  {review.reply && (
                    <section
                      aria-labelledby={`reply-${review.id}`}
                      className="mt-3 rounded-sm border-l-2 border-[var(--border-strong)] bg-[var(--surface)] px-3.5 py-2.5"
                    >
                      <h4 id={`reply-${review.id}`} className="flex flex-wrap items-baseline gap-x-2 text-[12px] font-semibold">
                        {t('review.sellerReply')}
                        <time dateTime={review.reply.repliedAt.toISOString()} className="text-[11px] font-normal text-[var(--fg-muted)]">
                          {formatDate(t.locale, review.reply.repliedAt)}
                        </time>
                        {review.reply.edited && (
                          <span className="text-[11px] font-normal text-[var(--fg-muted)]">{t('review.replyEdited')}</span>
                        )}
                      </h4>
                      <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-[var(--fg-secondary)]">
                        {review.reply.text}
                      </p>
                    </section>
                  )}

                  {review.images.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {review.images.map((image, i) => (
                        <li key={image.url}>
                          {/*
                            원본을 새 탭으로 연다. 확대 보기를 직접 만들면
                            포커스 가두기와 Esc 를 함께 다뤄야 하는데, 사진
                            한 장을 크게 보는 일에 그만한 장치가 필요하지 않다.
                          */}
                          <a href={image.url} target="_blank" rel="noreferrer">
                            <Image
                              src={image.url}
                              /*
                                작성자가 대체 텍스트를 적지 않는다. 억지로
                                받으면 대부분 "사진" 이라고 적힌다. 대신 몇
                                번째 사진인지와 누구의 후기인지를 우리가 말해
                                준다 — 없는 것보다 낫고, 거짓을 적지도 않는다.
                              */
                              alt={t('review.photoAlt', { name: review.authorName, index: i + 1 })}
                              width={96}
                              height={96}
                              /*
                                크기가 고정이라 sizes 를 주지 않는다. 주면
                                next/image 가 기기 크기 목록 전체로 후보를
                                만들고, 빼면 96·192 두 벌만 만든다.
                              */
                              {...(isBlurDataUrl(image.blurDataUrl)
                                ? { placeholder: 'blur' as const, blurDataURL: image.blurDataUrl }
                                : {})}
                              className="h-24 w-24 rounded-sm border border-[var(--border)] object-cover"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 flex items-center">
                    <ReviewHelpful
                      reviewId={review.id}
                      initialCount={review.helpfulCount}
                      initialPressed={review.helpfulByMe}
                      /* 로그인해야 하고 내 글이 아니어야 누를 수 있다 */
                      canVote={loggedIn && !review.isMine}
                    />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
