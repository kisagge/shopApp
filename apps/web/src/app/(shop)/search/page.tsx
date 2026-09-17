import type { Metadata } from 'next';
import Link from 'next/link';
import { catalogQuerySchema } from '@shop/contract';
import { resolvePriceRange, emptyResultReason, normalizeSearchTerm, MIN_SEARCH_LENGTH } from '@shop/core';
import { searchProducts, getFacets, getBrandOptions } from '~/lib/queries/catalog/search';
import { getPopularSearches } from '~/lib/queries/catalog/suggest';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { TrackedSearch } from '~/components/tracked-search';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';
import { EMPTY_RESULT_KEY } from '~/lib/i18n/empty-result';
import { EmptyResults } from '~/components/empty-results';
import { getTopCategories } from '~/lib/queries/catalog/products';

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
  // 손으로 친 숫자와 구간 프리셋 중 어느 쪽이 이기는지는 core 가 정한다
  const price = resolvePriceRange(parsed);
  const term = parsed.q ? normalizeSearchTerm(parsed.q) : null;

  // 검색어가 있으면 인기 검색어를 묻지 않는다 — 보여 줄 자리가 없다
  const [t, popular] = await Promise.all([getT(), term ? [] : getPopularSearches()]);

  // 검색어가 없거나 너무 짧으면 조회하지 않는다.
  // 한 글자로 카탈로그 전체를 긁는 것은 검색이 아니다.
  const page = term
    ? await searchProducts({
        q: term,
        sort: parsed.sort,
        minPrice: price.min ?? undefined,
        maxPrice: price.max ?? undefined,
        color: parsed.color,
        size: parsed.size,
        brands: parsed.brand,
        cursor: parsed.cursor,
      })
    : null;

  // 검색어 안에 실제로 있는 값만 고르게 한다
  const facets = term ? await getFacets({ q: term }) : undefined;

  const hasPrice = price.min !== null || price.max !== null;
  const hasFilters = parsed.color.length + parsed.size.length + parsed.brand.length > 0;
  /*
   * 결과가 없을 때만 갈 곳을 더 읽는다 — 인기 검색어와 카테고리. 결과가 있으면 보여 줄 자리가 없다.
   * 카테고리는 머리 메뉴와 같은 캐시를 쓴다.
   */
  const empty = page !== null && page.items.length === 0;
  const [emptyPopular, categories] = empty
    ? await Promise.all([getPopularSearches(), getTopCategories()])
    : [[], []];
  const brands = term ? await getBrandOptions({ q: term }) : [];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">SEARCH</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {term ? t('search.resultsFor', { term }) : t('search.heading')}
        </h1>
      </header>

      {!term ? (
        <div className="py-20 text-center">
          <p className="text-[13px] text-[var(--fg-muted)]">
            {parsed.q ? t('search.tooShort', { min: MIN_SEARCH_LENGTH }) : t('search.prompt')}
          </p>

          {/*
            기준을 못 넘으면 조회가 빈 목록을 준다 — 그때는 이 자리도
            통째로 비운다. 없는 인기를 지어내 보여 줄 이유가 없다.
          */}
          {popular.length > 0 && (
            <nav aria-label={t('popular.heading')} className="mt-8">
              <h2 className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
                {t('popular.heading')}
              </h2>
              <ul className="mt-3 flex flex-wrap justify-center gap-2">
                {popular.map((word) => (
                  <li key={word}>
                    <Link
                      href={{ pathname: '/search', query: { q: word } }}
                      className="inline-flex h-9 items-center rounded-full border border-[var(--border-strong)] px-3.5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
                    >
                      {word}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      ) : (
        <>
          {/* 결과 수까지 남긴다 — 0건 검색이 가장 값진 신호다 */}
          <TrackedSearch term={term} resultCount={page?.total ?? page?.items.length ?? 0} />

          <CatalogControls
            action="/search"
            sort={parsed.sort}
            minPrice={parsed.minPrice}
            maxPrice={parsed.maxPrice}
            priceBucket={price.bucket}
            query={term}
            total={page?.total ?? null}
            {...(facets ? { facets } : {})}
            selected={{ color: parsed.color, size: parsed.size }}
            brands={brands}
            selectedBrands={parsed.brand}
          />

          {empty ? (
            <EmptyResults
              t={t}
              title={t('empty.searchTitle')}
              reason={t(
                EMPTY_RESULT_KEY[
                  emptyResultReason({ hasQuery: true, hasPriceRange: hasPrice, hasCategory: false, hasFilters })
                ],
              )}
              // 조건만 지운다 — 검색어는 그대로 들고 간다
              clearHref={hasPrice || hasFilters ? { pathname: '/search', query: { q: term } } : null}
              // 방금 찾은 말은 빼고 권한다
              popular={emptyPopular.filter((w) => w !== term)}
              categories={categories}
            />
          ) : (
            page && (
              <>
                <TrackedProductList listId="search_results" itemCount={page.items.length}>
                  {/* h1 다음이 곧바로 카드의 h3 가 되지 않게 — 제목 단계는 건너뛰지 않는다 */}
                  <h2 className="sr-only">{t('catalog.productList')}</h2>
                  <div className="mt-8">
                    <ProductGrid
                      compare
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
