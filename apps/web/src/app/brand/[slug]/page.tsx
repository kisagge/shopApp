import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import { resolvePriceRange, emptyResultReason } from '@shop/core';
import { getBrandBySlug } from '~/lib/queries/catalog/brands';
import { searchProducts, getFacets } from '~/lib/queries/catalog/search';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';
import { getT } from '~/lib/i18n/server';
import { EMPTY_RESULT_KEY } from '~/lib/i18n/empty-result';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const brand = await getBrandBySlug((await params).slug);
  return brand ? { title: brand.name } : {};
}

/**
 * 브랜드 화면.
 *
 * 없어서 **자동완성이 브랜드를 제안하고도 검색 결과로 보냈다** —
 * `/search?q=STUDIO NOON` 은 글자가 스치기만 해도 걸리므로, 남의 상품
 * 설명에 그 이름이 있으면 함께 나온다. 브랜드로 좁히는 것은 검색이 아니라
 * 조건이라 조건으로 건다.
 */
export default async function BrandPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = catalogQuerySchema.parse(raw);
  // 손으로 친 숫자와 구간 프리셋 중 어느 쪽이 이기는지는 core 가 정한다
  const price = resolvePriceRange(query);

  const [brand, t] = await Promise.all([getBrandBySlug(slug), getT()]);
  // 정지된 가맹점의 브랜드는 조회가 주지 않는다 — 목록에서만 빼면 뒷문이 된다
  if (!brand) notFound();

  const [page, facets] = await Promise.all([
    searchProducts({
      brandSlug: slug,
      sort: query.sort,
      minPrice: price.min ?? undefined,
      maxPrice: price.max ?? undefined,
      color: query.color,
      size: query.size,
      cursor: query.cursor,
    }),
    getFacets({ brandSlug: slug }),
  ]);
  const products = page.items;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex items-center gap-4 py-8">
        {brand.logoUrl && (
          <span className="relative size-14 shrink-0 overflow-hidden rounded-full border border-[var(--border)]">
            <Image src={brand.logoUrl} alt="" aria-hidden="true" fill sizes="56px" className="object-cover" />
          </span>
        )}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
            {t('brand.eyebrow')}
          </p>
          <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">{brand.name}</h1>
        </div>
      </header>

      <div className="pt-2">
        <CatalogControls
          action={`/brand/${brand.slug}`}
          sort={query.sort}
          minPrice={query.minPrice}
          maxPrice={query.maxPrice}
          priceBucket={price.bucket}
          total={page.total}
          facets={facets}
          selected={{ color: query.color, size: query.size }}
        />
      </div>

      <section aria-label={t('brand.all')} className="pt-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24">
            <p className="text-[15px] font-medium">{t('brand.empty')}</p>
            <p className="text-[13px] text-[var(--fg-muted)]">
              {t(
                EMPTY_RESULT_KEY[
                  emptyResultReason({
                    hasQuery: false,
                    hasPriceRange: price.min !== null || price.max !== null,
                    hasCategory: true,
                  })
                ],
              )}
            </p>
          </div>
        ) : (
          <TrackedProductList listId={`brand_${brand.slug}`} itemCount={products.length}>
            <ProductGrid products={products} compare />
          </TrackedProductList>
        )}

        <CatalogPager basePath={`/brand/${brand.slug}`} params={raw} nextCursor={page.nextCursor} />
      </section>
    </div>
  );
}
