import { ProductCard } from '@shop/ui';
import { getFeaturedProducts, getTopCategories } from '~/lib/queries/products';

/** 상품 이미지가 아직 없어 톤 블록으로 대체한다. 실제 이미지가 붙으면 사라질 코드. */
const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

/**
 * 지금은 매 요청마다 DB를 읽는다.
 * ISR(revalidate)로 바꾸면 빌드 시점에 DB가 필요해지는데, CI에는 DB가 없어서
 * 빌드가 깨진다. 캐싱은 CI에 서비스 컨테이너를 붙이면서 같이 손볼 것.
 */
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [products, categories] = await Promise.all([
    getFeaturedProducts(10),
    getTopCategories(),
  ]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1280px] flex-col">
      <header className="safe-t flex h-13 items-center justify-between px-4 md:h-19 md:px-10">
        <h1 className="font-serif text-[21px] font-medium tracking-[0.18em] md:text-[25px]">
          <a href="/" className="text-[var(--fg)] no-underline">
            PLAIN
          </a>
        </h1>
        <nav aria-label="주요 카테고리" className="hidden md:block">
          <ul className="flex gap-1">
            {categories.map((c) => (
              <li key={c.slug}>
                <a
                  href={`/category/${c.slug}`}
                  className="inline-flex h-11 items-center px-4 text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
                >
                  {c.name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        <section
          aria-labelledby="hero-title"
          className="relative flex min-h-[380px] items-center bg-ph-sand px-4 py-14 md:min-h-[520px] md:px-10"
        >
          <div className="flex max-w-[460px] flex-col gap-4">
            <p className="text-[11px] font-medium tracking-[0.18em] text-n-600">EDITORIAL · 01</p>
            <h2
              id="hero-title"
              className="font-serif text-[32px] leading-tight font-medium tracking-tight text-n-900 md:text-[56px]"
            >
              겨울을 오래
              <br />
              입는 방법
            </h2>
            <p className="text-sm leading-relaxed text-n-700 md:text-[15px]">
              한 벌로 계절을 나는 아우터 12선. 소재와 무게, 그리고 오래 두고 입을 만한 실루엣을
              기준으로 골랐습니다.
            </p>
            <a
              href="/category"
              className="mt-2 inline-flex h-12 w-fit items-center rounded-sm bg-n-900 px-7 text-sm font-medium text-n-0 no-underline hover:bg-n-950"
            >
              기획전 보기
            </a>
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
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-6 md:gap-y-9 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p, i) => (
              <li key={p.slug}>
                <ProductCard
                  href={`/product/${p.slug}`}
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
        </section>
      </main>

      <footer className="safe-b mt-16 border-t border-[var(--border)] bg-[var(--surface)] px-4 py-8 md:px-10">
        <p className="font-serif text-lg font-medium tracking-[0.18em]">PLAIN</p>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--fg-muted)]">
          포트폴리오 목적으로 제작된 화면입니다. 사업자 정보는 실제 값으로 교체하세요.
        </p>
      </footer>
    </div>
  );
}
