import { Suspense } from 'react';
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
import { GridSkeleton, StripSkeleton } from '~/components/section-skeleton';
import { getT } from '~/lib/i18n/server';

/**
 * 화면은 매 요청마다 그리되 **읽기는 캐싱한다**(lib/cache).
 *
 * ISR 로 바꾸지 않은 이유는 빌드가 DB 에 닿아야 하기 때문이다 — 설정 하나가
 * 어긋나면 배포가 통째로 실패하는 쪽으로 바뀐다. 문제였던 "매 요청 DB 를
 * 친다" 는 읽기 캐싱으로 사라졌다.
 *
 * **그런데 읽기를 다 받은 뒤에야 첫 바이트를 보내고 있었다.**
 *
 * 프로덕션 실사용자 값(2026-10, 웹 p75)이 그것을 가리켰다 — TTFB 1,302ms 에
 * FCP 3,702ms. 첫 바이트와 첫 그림 사이가 2.4초고, LCP(3,896ms)는 FCP 뒤
 * 200ms 라 **LCP 가 나쁜 것이 거의 전부 FCP 때문**이었다. 캐시된 읽기 셋이
 * 빨라도 그것을 다 모을 때까지는 머리글자 하나 못 그린다.
 *
 * 그래서 조회를 **조각마다 자기 자리로 내린다.** 화면 몸통이 기다리는 것은
 * 사전뿐이고(메모리다), 껍데기는 그 즉시 나간다. 상품 상세가 이미 쓰는
 * 방법이고(streaming-boundaries 검사), 여기만 안 하고 있었다.
 *
 * **loading.tsx 는 쓸 수 없다.** 그것을 붙이면 Next 가 껍데기를 먼저 흘리며
 * 상태 코드를 200 으로 못 박는데, 없는 주소에 404 를 내야 하는 화면들이
 * 그래서 가짜 200 이 됐다(같은 검사가 그 자리를 지킨다). 홈은 404 를 내지
 * 않지만, 길은 한 가지로 둔다 — 조각을 Suspense 로 감싼다.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // 사전은 메모리에서 온다 — 여기서 기다리는 것에 I/O 가 없다
  const t = await getT();

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

      {/*
        **빈자리 높이를 배너와 똑같이 잡는다**(min-h-[380px] md:min-h-[520px]).
        어긋나면 배너가 도착하는 순간 아래가 통째로 밀린다 — 지금 CLS 가
        0.001 이고, 스트리밍으로 얻은 것을 레이아웃 이동으로 도로 잃는 일은
        하지 않는다.
      */}
      <Suspense fallback={<div aria-hidden="true" className="min-h-[380px] bg-[var(--surface-1)] md:min-h-[520px]" />}>
        <HeroBanners />
      </Suspense>

      <Suspense fallback={<StripSkeleton height="420px" />}>
        <Collections />
      </Suspense>

      <section aria-labelledby="pick-title" className="px-4 pt-12 md:px-10 md:pt-20">
        <div className="mb-6 flex flex-col gap-2 md:mb-7">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
            {t('home.pickEyebrow')}
          </p>
          <h2 id="pick-title" className="text-lg font-semibold tracking-tight md:text-[28px]">
            {t('home.pick')}
          </h2>
        </div>
        {/* 제목은 데이터가 필요 없다 — 먼저 그린다 */}
        <Suspense fallback={<GridSkeleton />}>
          <EditorPick />
        </Suspense>
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

/**
 * 조각마다 자기 조회를 한다 — 화면 몸통이 이것을 기다리지 않게.
 *
 * 배너는 이 가게의 첫인상이자 LCP 를 지는 자리라 맨 위에 둔다. 비어 있으면
 * 아무것도 그리지 않는다(HomeBanners) — 배너가 하나도 없는 것은 가게를 막
 * 세운 상태지 평소의 모습이 아니다.
 */
async function HeroBanners() {
  // 게시 기간 판정은 서버 시각으로 한다 — 브라우저 시계를 믿으면
  // 시계가 틀어진 사용자에게 끝난 기획전이 계속 보인다.
  const banners = await getLiveBanners();

  return (
    <HomeBanners
      banners={banners.map((b) => ({
        id: b.id, eyebrow: b.eyebrow, headline: b.headline, subcopy: b.subcopy,
        ctaLabel: b.ctaLabel, href: b.href,
        imageUrl: b.imageUrl, imageAlt: b.imageAlt, blurDataUrl: b.blurDataUrl,
        imageCredit: b.imageCredit,
        tone: b.tone,
      }))}
    />
  );
}

/**
 * 기획전이 없으면 줄을 통째로 비운다 — 최근 본 상품과 같은 판단이다.
 * "준비 중입니다" 를 띄우는 것은 자리를 채우는 것이지 알려 주는 것이 아니다.
 */
async function Collections() {
  return <CollectionStrip collections={await getLiveCollections()} />;
}

async function EditorPick() {
  const products = await getFeaturedProducts(10);

  return (
    <TrackedProductList listId="home_editors_pick" itemCount={products.length}>
      <ProductGrid products={products}
        columns="lg:grid-cols-4 xl:grid-cols-5"
        // 배너가 먼저 있고 격자는 한참 아래다. 미리 받을 이유가 없다.
        priorityCount={0}
      />
    </TrackedProductList>
  );
}
