import type { Metadata } from 'next';
import { ProductCard } from '@shop/ui';
import { catalogQuerySchema } from '@shop/contract';
import { emptyResultHint, normalizeSearchTerm, MIN_SEARCH_LENGTH } from '@shop/core';
import { searchProducts } from '~/lib/queries/products';
import { TrackedProductList } from '~/components/tracked-product-list';
import { TrackedSearch } from '~/components/tracked-search';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';
import { AppLink } from '~/components/app-link';

export const dynamic = 'force-dynamic';

const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const q = typeof raw['q'] === 'string' ? raw['q'] : '';
  const term = normalizeSearchTerm(q);
  return { title: term ? `"${term}" 검색 결과` : '검색' };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = catalogQuerySchema.parse(raw);
  const term = parsed.q ? normalizeSearchTerm(parsed.q) : null;

  // 검색어가 없거나 너무 짧으면 조회하지 않는다.
  // 한 글자로 카탈로그 전체를 긁는 것은 검색이 아니다.
  const page = term
    ? await searchProducts({
        q: term,
        sort: parsed.sort,
        minPrice: parsed.minPrice,
        maxPrice: parsed.maxPrice,
        cursor: parsed.cursor,
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">SEARCH</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {term ? <>&ldquo;{term}&rdquo; 검색 결과</> : '검색'}
        </h1>
      </header>

      {!term ? (
        <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
          {parsed.q
            ? `검색어는 ${MIN_SEARCH_LENGTH}글자 이상 입력해 주세요.`
            : '찾으시는 상품명이나 브랜드를 입력해 주세요.'}
        </p>
      ) : (
        <>
          {/* 결과 수까지 남긴다 — 0건 검색이 가장 값진 신호다 */}
          <TrackedSearch term={term} resultCount={page?.total ?? page?.items.length ?? 0} />

          <CatalogControls
            action="/search"
            sort={parsed.sort}
            minPrice={parsed.minPrice}
            maxPrice={parsed.maxPrice}
            query={term}
            total={page?.total ?? null}
          />

          {page && page.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-24">
              <p className="text-[15px] font-medium">검색 결과가 없습니다</p>
              <p className="text-[13px] text-[var(--fg-muted)]">
                {emptyResultHint({
                  hasQuery: true,
                  hasPriceRange: parsed.minPrice !== undefined || parsed.maxPrice !== undefined,
                  hasCategory: false,
                })}
              </p>
            </div>
          ) : (
            page && (
              <>
                <TrackedProductList listId="search_results" itemCount={page.items.length}>
                  <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-9 lg:grid-cols-4 xl:grid-cols-5">
                    {page.items.map((p, i) => (
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

                <CatalogPager basePath="/search" params={raw} nextCursor={page.nextCursor} />
              </>
            )
          )}
        </>
      )}
    </div>
  );
}
