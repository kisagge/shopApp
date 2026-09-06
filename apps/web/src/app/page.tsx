import { siteStructuredData } from '@shop/core';
import { absoluteUrl } from '~/lib/urls';
import { getFeaturedProducts } from '~/lib/queries/catalog/products';
import { getLiveCollections } from '~/lib/queries/catalog/collections';
import { getLiveBanners } from '~/lib/admin/manage-banner';
import { HomeBanners } from '~/components/home-banners';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { RecentlyViewed } from '~/components/recently-viewed';
import { CollectionStrip } from '~/components/collection-strip';
import { getT } from '~/lib/i18n/server';

/**
 * 화면은 매 요청마다 그리되 **읽기는 캐싱한다**(lib/cache).
 *
 * ISR 로 바꾸지 않은 이유는 빌드가 DB 에 닿아야 하기 때문이다 — 설정 하나가
 * 어긋나면 배포가 통째로 실패하는 쪽으로 바뀐다. 문제였던 "매 요청 DB 를
 * 친다" 는 읽기 캐싱으로 사라졌다.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [products, banners, collections, t] = await Promise.all([
    getFeaturedProducts(10),
    // 게시 기간 판정은 서버 시각으로 한다 — 브라우저 시계를 믿으면
    // 시계가 틀어진 사용자에게 끝난 기획전이 계속 보인다.
    getLiveBanners(),
    getLiveCollections(),
    getT(),
  ]);

  /*
   * 사이트 자체에 대한 구조화 데이터.
   *
   * 검색 결과에서 도메인 대신 사이트 이름이 뜨고, 사이트 내 검색이 함께
   * 붙는 경우가 있다. 상품 페이지의 구조화 데이터와 같은 결이다.
   */
  const jsonLd = siteStructuredData({
    name: 'PLAIN',
    url: absoluteUrl('/'),
    description: '오래 두고 입을 것만 골라 담은 편집숍',
    searchPath: '/search?q=',
  });

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col">
      {/* 상품명·설명과 달리 고정 문자열뿐이지만, 넣는 방식은 같게 둔다 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/*
        페이지에는 h1 이 하나 있어야 하는데, 배너 제목을 h1 으로 쓰면
        슬라이드를 넘길 때마다 문서의 제목이 바뀐다. 화면에는 브랜드와
        배너가 이미 보이므로 제목은 읽히기만 하면 된다.
      */}
      <h1 className="sr-only">{t('home.srTitle')}</h1>

      <HomeBanners
        banners={banners.map((b) => ({
          id: b.id, eyebrow: b.eyebrow, headline: b.headline, subcopy: b.subcopy,
          ctaLabel: b.ctaLabel, href: b.href,
          imageUrl: b.imageUrl, imageAlt: b.imageAlt, blurDataUrl: b.blurDataUrl,
          imageCredit: b.imageCredit,
          tone: b.tone,
        }))}
      />

      {/*
        기획전이 없으면 줄을 통째로 비운다 — 최근 본 상품과 같은 판단이다.
        "준비 중입니다" 를 띄우는 것은 자리를 채우는 것이지 알려 주는 것이
        아니다.
      */}
      <CollectionStrip collections={collections} />

      <section aria-labelledby="pick-title" className="px-4 pt-12 md:px-10 md:pt-20">
        <div className="mb-6 flex flex-col gap-2 md:mb-7">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
            {t('home.pickEyebrow')}
          </p>
          <h2 id="pick-title" className="text-lg font-semibold tracking-tight md:text-[28px]">
            {t('home.pick')}
          </h2>
        </div>
        <TrackedProductList listId="home_editors_pick" itemCount={products.length}>
          <ProductGrid products={products}
            columns="lg:grid-cols-4 xl:grid-cols-5"
            // 배너가 먼저 있고 격자는 한참 아래다. 미리 받을 이유가 없다.
            priorityCount={0}
          />
        </TrackedProductList>
      </section>

      {/*
        본 적이 없으면 이 줄은 통째로 그려지지 않는다 — 처음 온 사람에게는
        "아직 없습니다" 를 띄우느니 자리를 비우는 편이 낫다.
      */}
      <div className="px-4 md:px-10">
        <RecentlyViewed />
      </div>
    </div>
  );
}
