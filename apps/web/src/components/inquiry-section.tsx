import type { PublicInquiry } from '~/lib/queries/inquiries';
import { InquiryForm } from './inquiry-form';
import { InquiryActions } from './inquiry-actions';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

/**
 * 상품 상세의 문의 영역.
 *
 * 리뷰는 산 사람만 쓸 수 있어서, **사기 전에 물어볼 자리**가 따로 필요하다.
 */
export function InquirySection({
  productId,
  inquiries,
  loggedIn,
}: {
  productId: string;
  inquiries: readonly PublicInquiry[];
  loggedIn: boolean;
}) {
  return (
    <section aria-labelledby="inquiry-title" className="mt-16">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-4">
        <h2 id="inquiry-title" className="text-[17px] font-semibold">
          상품 문의
          <span className="tnum ml-2 text-[13px] font-normal text-[var(--fg-muted)]">
            {inquiries.length}
          </span>
        </h2>
      </div>

      {loggedIn ? (
        <InquiryForm productId={productId} />
      ) : (
        <p className="py-5 text-[13px] text-[var(--fg-secondary)]">
          문의는 로그인 후 남기실 수 있습니다.
        </p>
      )}

      {inquiries.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-[var(--fg-muted)]">
          아직 문의가 없습니다.
        </p>
      ) : (
        <ul className="flex list-none flex-col p-0">
          {inquiries.map((inquiry) => (
            <li key={inquiry.id} className="border-t border-[var(--surface-2)] py-5">
              <article className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px]">
                  <span
                    className={`rounded-xs px-1.5 py-0.5 text-[11px] ${
                      inquiry.answeredAt
                        ? 'bg-[var(--surface-2)] text-[var(--fg-secondary)]'
                        : 'bg-accent/12 text-accent'
                    }`}
                  >
                    {inquiry.answeredAt ? '답변 완료' : '답변 대기'}
                  </span>
                  {inquiry.isPrivate && (
                    <span className="text-[var(--fg-muted)]" aria-label="비공개 문의">
                      🔒 비공개
                    </span>
                  )}
                  <span className="text-[var(--fg-secondary)]">{inquiry.authorName}</span>
                  <time dateTime={inquiry.createdAt.toISOString()} className="text-[var(--fg-muted)]">
                    {dateFormat.format(inquiry.createdAt)}
                  </time>
                </p>

                <p
                  className={`text-[14px] leading-relaxed ${
                    inquiry.readable ? 'whitespace-pre-wrap' : 'text-[var(--fg-muted)]'
                  }`}
                >
                  {inquiry.content}
                </p>

                {inquiry.answer && (
                  <div className="mt-1 rounded-sm bg-[var(--surface)] p-4">
                    <p className="text-[11px] font-medium text-[var(--fg-secondary)]">판매자 답변</p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                      {inquiry.answer}
                    </p>
                  </div>
                )}

                {(inquiry.isMine || inquiry.canAnswer) && (
                  <InquiryActions
                    inquiryId={inquiry.id}
                    canDelete={inquiry.isMine}
                    canAnswer={inquiry.canAnswer && inquiry.answeredAt === null}
                  />
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
