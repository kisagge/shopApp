import Image from 'next/image';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@shop/auth/session';
import { getReviewableItems } from '~/lib/queries/reviews';
import { ReviewForm } from './review-form';

export const metadata: Metadata = { title: '리뷰 쓰기' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

export default async function WriteReviewsPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/reviews');

  const items = await getReviewableItems(user.id);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label="현재 위치">
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">마이페이지</Link>
        </nav>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">리뷰 쓰기</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          배송이 완료된 상품에 후기를 남길 수 있습니다.
        </p>
      </header>

      {items.length === 0 ? (
        <p className="py-24 text-center text-[13px] text-[var(--fg-muted)]">
          지금 리뷰를 쓸 수 있는 상품이 없습니다.
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
                        배송 완료
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
