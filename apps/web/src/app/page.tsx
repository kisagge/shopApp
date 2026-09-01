import { ProductCard } from '@shop/ui';
import { getFeaturedProducts } from '~/lib/queries/products';
import { getLiveBanners } from '~/lib/admin/manage-banner';
import { HomeBanners } from '~/components/home-banners';
import { TrackedProductList } from '~/components/tracked-product-list';
import { AppLink } from '~/components/app-link';

/** 이미지를 아직 안 올린 상품의 자리 색. 올리면 이 자리에 사진이 들어간다. */
const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

/**
 * 지금은 매 요청마다 DB를 읽는다.
 * ISR(revalidate)로 바꾸면 빌드 시점에 DB가 필요해지는데 CI에는 DB가 없어서
 * 빌드가 깨진다. 캐싱은 CI에 서비스 컨테이너를 붙이면서 같이 손볼 것.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [products, banners] = await Promise.all([
    getFeaturedProducts(10),
    // 게시 기간 판정은 서버 시각으로 한다 — 브라우저 시계를 믿으면
    // 시계가 틀어진 사용자에게 끝난 기획전이 계속 보인다.
    getLiveBanners(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col">
      {/*
        페이지에는 h1 이 하나 있어야 하는데, 배너 제목을 h1 으로 쓰면
        슬라이드를 넘길 때마다 문서의 제목이 바뀐다. 화면에는 브랜드와
        배너가 이미 보이므로 제목은 읽히기만 하면 된다.
      */}
      <h1 className="sr-only">PLAIN — 오래 입는 옷</h1>

      <HomeBanners
        banners={banners.map((b) => ({
          id: b.id, eyebrow: b.eyebrow, headline: b.headline, subcopy: b.subcopy,
          ctaLabel: b.ctaLabel, href: b.href,
          imageUrl: b.imageUrl, imageAlt: b.imageAlt, tone: b.tone,
        }))}
      />

      <section aria-labelledby="pick-title" className="px-4 pt-12 md:px-10 md:pt-20">
        <div className="mb-6 flex flex-col gap-2 md:mb-7">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
            EDITOR&rsquo;S PICK
          </p>
          <h2 id="pick-title" className="text-lg font-semibold tracking-tight md:text-[28px]">
            에디터가 고른 것
          </h2>
        </div>
        <TrackedProductList listId="home_editors_pick" itemCount={products.length}>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-9 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p, i) => (
              <li key={p.slug} data-product-id={p.id}>
                <ProductCard
                  href={`/product/${p.slug}`}
                  linkComponent={AppLink}
                  brand={p.brand}
                  name={p.name}
                  price={p.price}
                  listPrice={p.listPrice}
                  discountPercent={p.discountPercent}
                  rating={p.rating}
                  reviewCount={p.reviewCount}
                  soldOut={p.soldOut}
                  isNew={p.isNew}
                  image={p.imageUrl && p.imageAlt ? { src: p.imageUrl, alt: p.imageAlt } : undefined}
                  placeholderTone={TONES[i % TONES.length] ?? 'sand'}
                />
              </li>
            ))}
          </ul>
        </TrackedProductList>
      </section>
    </div>
  );
}
