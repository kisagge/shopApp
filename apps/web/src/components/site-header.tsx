import { TrackedLink as Link } from './tracked-link';
import { getTopCategories } from '~/lib/queries/catalog/products';
import { SessionNav } from './session-nav';
import { MobileMenu } from './mobile-menu';
import { CartBadge } from './cart-badge';
import { SearchBox } from './search-box';
import { NotificationBell } from './notification-bell';
import { getT } from '~/lib/i18n/server';
import { getViewer } from '~/lib/viewer';

/** 모든 페이지가 쓰는 헤더. 카테고리는 서버에서 읽는다. */
export async function SiteHeader() {
  const [categories, t, viewer] = await Promise.all([getTopCategories(), getT(), getViewer()]);

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
        <MobileMenu categories={categories} user={viewer} />

        <p className="font-serif text-[21px] font-medium tracking-[0.18em] md:text-[25px]">
          <Link href="/" className="text-[var(--fg)] no-underline">PLAIN</Link>
        </p>

        {/*
          **min-w-0 이 있어야 줄어든다.** flex 자식은 기본이 min-width:auto 라
          내용보다 좁아지지 않는다. 그래서 갈래가 많거나 오른쪽 계정 묶음이
          길어지면(로그인하면 480px 이 된다) 헤더가 화면보다 넓어지고,
          **페이지 전체가 가로로 스크롤됐다** — 768px 에서 945px 이었다.
          줄어들 수 있게 하고, 그래도 모자라면 갈래 줄만 가로로 민다.
        */}
        <nav aria-label={t('nav.categories')} className="hidden min-w-0 flex-1 md:block">
          <ul className="flex overflow-x-auto">
            {categories.map((c) => (
              /*
                줄어들 수 있게 열어 두면 이번엔 **글자가 줄바꿈된다** — 좁아진
                상자 안에서 '액세서리' 가 두 줄이 됐다. 줄은 밀되 낱말은 안
                줄어들게 둔다. 주문 목록 탭이 같은 처방을 쓴다.
              */
              <li key={c.slug} className="shrink-0">
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-11 items-center whitespace-nowrap px-4 text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
                >
                  {t.category(c.slug, c.name)}
                </Link>
              </li>
            ))}
            {/* 기획전은 갈래가 아니라 편집이라 카테고리 뒤에 따로 둔다 */}
            <li className="shrink-0">
              <Link
                href="/collections"
                className="inline-flex h-11 items-center whitespace-nowrap px-4 text-sm font-medium text-[var(--fg)] no-underline"
              >
                {t('collection.heading')}
              </Link>
            </li>
          </ul>
        </nav>

        <span className="ml-auto flex shrink-0 items-center gap-4 md:ml-0">
          {/* GET 폼이라 자바스크립트 없이도 검색이 된다 */}
          <form method="get" action="/search" role="search" className="hidden sm:block">
            <SearchBox id="site-search" />
          </form>
          <span className="hidden md:inline-flex md:items-center">
            <SessionNav user={viewer} />
          </span>
          {/* 좁은 화면에서도 남긴다 — 알림은 놓치면 뜻이 없다 */}
          <NotificationBell />
          <CartBadge />
        </span>
      </div>
    </header>
  );
}
