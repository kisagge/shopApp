import Image from 'next/image';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { format, won } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { getWishlist } from '~/lib/wishlist/wishlist';
import { WishlistButton } from '~/components/wishlist-button';
import { AppLink } from '~/components/app-link';

export const metadata: Metadata = { title: '찜한 상품' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

export default async function WishlistPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/wishlist');

  const items = await getWishlist(user.id);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label="현재 위치">
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">마이페이지</Link>
        </nav>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">찜한 상품</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{items.length}</span>개
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <p className="text-[15px] font-medium">찜한 상품이 없습니다</p>
          <p className="text-[13px] text-[var(--fg-muted)]">
            마음에 드는 상품의 하트를 눌러 두면 여기 모입니다.
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex h-11 items-center rounded-sm border border-n-300 px-5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
          >
            상품 보러 가기
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.productId} className="border-t border-[var(--border)] py-5 last:border-b">
              <article className="flex items-center gap-4">
                <AppLink
                  href={`/product/${item.slug}`}
                  className="flex min-w-0 flex-1 items-center gap-4 no-underline"
                >
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl} alt={item.imageAlt ?? ''}
                      // 크기가 고정이라 sizes 를 주지 않는다 — 1x·2x 두 벌만 만들어진다
                      width={64} height={80}
                      className="h-20 w-16 shrink-0 rounded-xs bg-[var(--surface-2)] object-cover"
                    />
                  ) : (
                    <span aria-hidden="true" className="h-20 w-16 shrink-0 rounded-xs bg-ph-sand" />
                  )}

                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-[11px] text-[var(--fg-muted)]">{item.brand}</span>
                    <span className="text-[14px] text-[var(--fg)]">{item.name}</span>
                    <span className="tnum text-[14px] font-semibold">{format(won(item.price))}원</span>
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      <time dateTime={item.addedAt.toISOString()}>
                        {dateFormat.format(item.addedAt)}
                      </time>{' '}
                      찜
                    </span>
                  </div>
                </AppLink>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {/* 상태를 색이 아니라 글로 알린다 */}
                  {item.unavailable ? (
                    <span className="text-[11px] font-medium text-accent">판매 종료</span>
                  ) : item.soldOut ? (
                    <span className="text-[11px] font-medium text-[var(--fg-muted)]">품절</span>
                  ) : null}
                  <WishlistButton
                    productId={item.productId}
                    productName={item.name}
                    initialWishlisted
                    loggedIn
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
