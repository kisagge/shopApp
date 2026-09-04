import Link from 'next/link';
import { categoryName } from '@shop/i18n';
import { getTopCategories } from '~/lib/queries/products';
import { SessionNav } from './session-nav';
import { MobileMenu } from './mobile-menu';
import { CartBadge } from './cart-badge';
import { getLocale, getT } from '~/lib/i18n/server';

/** 모든 페이지가 쓰는 헤더. 카테고리는 서버에서 읽는다. */
export async function SiteHeader() {
  const [categories, locale, t] = await Promise.all([getTopCategories(), getLocale(), getT()]);

  /*
   * sticky + safe-t 는 웹뷰 때문이다.
   *
   * 앱에는 주소창이 없어서 스크롤하면 헤더가 OS 상태바 밑으로 그대로 지나가
   * 시계와 글자가 겹친다. 브라우저에서는 크롬이 가려 주던 자리다. 위에
   * 고정하고 상태바 높이만큼 밀어 둔다.
   *
   * 배경을 명시한다 — 투명하면 밑으로 지나가는 본문이 비친다.
   */
  return (
    <header className="safe-t relative sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg)]">
      <div className="mx-auto flex h-13 w-full max-w-[1280px] items-center gap-3 px-4 md:h-19 md:gap-6 md:px-10">
        {/* 좁은 화면에서 카테고리·검색·계정으로 가는 유일한 통로 */}
        <MobileMenu categories={categories} />

        <p className="font-serif text-[21px] font-medium tracking-[0.18em] md:text-[25px]">
          <Link href="/" className="text-[var(--fg)] no-underline">PLAIN</Link>
        </p>

        <nav aria-label={t('nav.categories')} className="hidden flex-1 md:block">
          <ul className="flex">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-11 items-center px-4 text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
                >
                  {categoryName(locale, c.slug, c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <span className="ml-auto flex shrink-0 items-center gap-4 md:ml-0">
          {/* GET 폼이라 자바스크립트 없이도 검색이 된다 */}
          <form method="get" action="/search" role="search" className="hidden sm:block">
            <label htmlFor="site-search" className="sr-only">
              {t('nav.searchLabel')}
            </label>
            <input
              id="site-search"
              type="search"
              name="q"
              placeholder={t('nav.searchPlaceholder')}
              maxLength={60}
              className="h-9 w-36 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus-visible:border-n-500 md:w-48"
            />
          </form>
          <span className="hidden md:inline-flex md:items-center">
            <SessionNav />
          </span>
          <CartBadge />
        </span>
      </div>
    </header>
  );
}
