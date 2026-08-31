import Link from 'next/link';
import { ProductCard } from '@shop/ui';
import { getFeaturedProducts } from '~/lib/queries/products';
import { TrackedProductList } from '~/components/tracked-product-list';
import { AppLink } from '~/components/app-link';

/** 상품 이미지가 아직 없어 톤 블록으로 대체한다. 실제 이미지가 붙으면 사라질 코드. */
const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

/**
 * 지금은 매 요청마다 DB를 읽는다.
 * ISR(revalidate)로 바꾸면 빌드 시점에 DB가 필요해지는데 CI에는 DB가 없어서
 * 빌드가 깨진다. 캐싱은 CI에 서비스 컨테이너를 붙이면서 같이 손볼 것.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const products = await getFeaturedProducts(10);

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col">
      <section
        aria-labelledby="hero-title"
        className="relative flex min-h-[380px] items-center bg-ph-sand px-4 py-14 md:min-h-[520px] md:px-10"
      >
        <div className="flex max-w-[460px] flex-col gap-4">
          <p className="text-[11px] font-medium tracking-[0.18em] text-n-600">EDITORIAL · 01</p>
          <h1
            id="hero-title"
            className="font-serif text-[32px] leading-tight font-medium tracking-tight text-n-900 md:text-[56px]"
          >
            겨울을 오래
            <br />
            입는 방법
          </h1>
          <p className="text-sm leading-relaxed text-n-700 md:text-[15px]">
            한 벌로 계절을 나는 아우터 12선. 소재와 무게, 그리고 오래 두고 입을 만한 실루엣을
            기준으로 골랐습니다.
          </p>
          <Link
            href="/category/outer"
            className="mt-2 inline-flex h-12 w-fit items-center rounded-sm bg-n-900 px-7 text-sm font-medium text-n-0 no-underline hover:bg-n-950"
          >
            기획전 보기
          </Link>
        </div>
      </section>

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
