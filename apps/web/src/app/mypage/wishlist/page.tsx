import Image from 'next/image';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@shop/auth/session';
import { getWishlist } from '~/lib/wishlist/wishlist';
import { WishlistButton } from '~/components/wishlist-button';
import { AppLink } from '~/components/app-link';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { formatMoney } from '@shop/i18n';
import { getLocale } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.wishlistHeading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

export default async function WishlistPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/wishlist');

  const [items, locale, t] = await Promise.all([getWishlist(user.id), getLocale(), getT()]);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
            {t('nav.mypage')}
          </Link>
        </nav>
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t('my.wishlistHeading')}</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {t('catalog.count', { count: items.length })}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-24">
          <p className="text-[15px] font-medium">{t('my.wishlistEmpty')}</p>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {t('my.wishlistEmptyHint')}
          </p>
          <Link
            href="/"
            className="mt-2 inline-flex h-11 items-center rounded-sm border border-n-300 px-5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
          >
            {t('my.wishlistGo')}
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
                    <span className="tnum text-[14px] font-semibold">{formatMoney(locale, item.price)}</span>
                    <span className="text-[11px] text-[var(--fg-muted)]">
                      <time dateTime={item.addedAt.toISOString()}>
                        {dateFormat.format(item.addedAt)}
                      </time>{' '}
                      {t('my.wishlist')}
                    </span>
                  </div>
                </AppLink>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {/* 상태를 색이 아니라 글로 알린다 */}
                  {item.unavailable ? (
                    <span className="text-[11px] font-medium text-accent">{t('my.discontinued')}</span>
                  ) : item.soldOut ? (
                    <span className="text-[11px] font-medium text-[var(--fg-muted)]">{t('catalog.soldOut')}</span>
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
