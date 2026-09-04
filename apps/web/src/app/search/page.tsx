import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import { emptyResultReason, normalizeSearchTerm, MIN_SEARCH_LENGTH } from '@shop/core';
import { searchProducts } from '~/lib/queries/products';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { TrackedSearch } from '~/components/tracked-search';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';
import { EMPTY_RESULT_KEY } from '~/lib/i18n/empty-result';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const raw = await searchParams;
  const q = typeof raw['q'] === 'string' ? raw['q'] : '';
  const term = normalizeSearchTerm(q);
  const t = await getT();
  // 검색어마다 다른 주소가 되어 같은 상품이 여러 번 잡힌다
  return { title: term ? t('search.resultsFor', { term }) : t('search.heading'), ...NO_INDEX };
}

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const parsed = catalogQuerySchema.parse(raw);
  const term = parsed.q ? normalizeSearchTerm(parsed.q) : null;
  const t = await getT();

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
          {term ? t('search.resultsFor', { term }) : t('search.heading')}
        </h1>
      </header>

      {!term ? (
        <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
          {parsed.q
            ? t('search.tooShort', { min: MIN_SEARCH_LENGTH })
            : t('search.prompt')}
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
              <p className="text-[15px] font-medium">{t('empty.searchTitle')}</p>
              <p className="text-[13px] text-[var(--fg-muted)]">
                {t(
                  EMPTY_RESULT_KEY[
                    emptyResultReason({
                      hasQuery: true,
                      hasPriceRange:
                        parsed.minPrice !== undefined || parsed.maxPrice !== undefined,
                      hasCategory: false,
                    })
                  ],
                )}
              </p>
            </div>
          ) : (
            page && (
              <>
                <TrackedProductList listId="search_results" itemCount={page.items.length}>
                  <div className="mt-8">
                    <ProductGrid
                      products={page.items}
                      columns="lg:grid-cols-4 xl:grid-cols-5"
                      // 여기만 xl 에서 5열이라 표시 크기도 달라진다
                      imageSizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                    />
                  </div>
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
