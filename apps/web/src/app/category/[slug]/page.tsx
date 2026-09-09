import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import { resolvePriceRange, emptyResultReason } from '@shop/core';
import { categoryName } from '@shop/i18n';
import { getCategoryWithChildren } from '~/lib/queries/catalog/products';
import { searchProducts, getFacets, getBrandOptions } from '~/lib/queries/catalog/search';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';
import { getLocale, getT } from '~/lib/i18n/server';
import { EMPTY_RESULT_KEY } from '~/lib/i18n/empty-result';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const [category, locale, t] = await Promise.all([
    getCategoryWithChildren(slug),
    getLocale(),
    getT(),
  ]);
  return {
    title: category ? categoryName(locale, category.slug, category.name) : t('nav.categoriesPlain'),
  };
}

export default async function CategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = catalogQuerySchema.parse(raw);
  // 손으로 친 숫자와 구간 프리셋 중 어느 쪽이 이기는지는 core 가 정한다
  const price = resolvePriceRange(query);

  const [category, page, facets, brands] = await Promise.all([
    getCategoryWithChildren(slug),
    searchProducts({
      categorySlug: slug,
      sort: query.sort,
      minPrice: price.min ?? undefined,
      maxPrice: price.max ?? undefined,
      color: query.color,
      size: query.size,
      brands: query.brand,
      cursor: query.cursor,
    }),
    // 고를 수 있는 값은 이 카테고리 안에 실제로 있는 것만
    getFacets({ categorySlug: slug }),
    getBrandOptions({ categorySlug: slug }),
  ]);
  if (!category) notFound();

  const [locale, t] = await Promise.all([getLocale(), getT()]);
  const products = page.items;
  const title = categoryName(locale, category.slug, category.name);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <nav aria-label={t('nav.breadcrumb')} className="py-5">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="text-xs text-[var(--fg-muted)]">
              {t('nav.home')}
            </Link>
          </li>
          {category.parent && (
            <>
              <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
              <li>
                <Link href={`/category/${category.parent.slug}`} className="text-xs text-[var(--fg-muted)]">
                  {categoryName(locale, category.parent.slug, category.parent.name)}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li>
            <span aria-current="page" className="text-xs font-medium text-[var(--fg-secondary)]">
              {title}
            </span>
          </li>
        </ol>
      </nav>

      <div className="flex items-baseline gap-3 border-b border-[var(--border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {/* 이 쪽에 담긴 수가 아니라 조건에 맞는 전체 수 */}
          <span className="tnum font-semibold text-[var(--fg-secondary)]">
            {t('catalog.count', { count: page.total ?? products.length })}
          </span>
        </p>
      </div>

      {category.children.length > 0 && (
        <nav aria-label={t('category.subcategories')} className="border-b border-[var(--border)]">
          <ul className="flex gap-1 overflow-x-auto">
            <li>
              <Link
                href={`/category/${category.slug}`}
                aria-current="page"
                className="inline-flex h-12 items-center px-4 text-sm font-semibold shadow-[inset_0_-2px_0_var(--fg)]"
              >
                {t('category.all')}
              </Link>
            </li>
            {category.children.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className="inline-flex h-12 items-center px-4 text-sm text-[var(--fg-muted)]">
                  {categoryName(locale, c.slug, c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className="pt-6">
        <CatalogControls
          action={`/category/${category.slug}`}
          sort={query.sort}
          minPrice={query.minPrice}
          maxPrice={query.maxPrice}
          priceBucket={price.bucket}
          total={page.total}
          facets={facets}
          selected={{ color: query.color, size: query.size }}
          brands={brands}
          selectedBrands={query.brand}
        />
      </div>

      <section aria-label={t('catalog.productList')} className="pt-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24">
            <p className="text-[15px] font-medium">{t('empty.title')}</p>
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
          <TrackedProductList listId={`category_${category.slug}`} itemCount={products.length}>
            <ProductGrid products={products}
            />
          </TrackedProductList>
        )}

        <CatalogPager
          basePath={`/category/${category.slug}`}
          params={raw}
          nextCursor={page.nextCursor}
        />
      </section>
    </div>
  );
}
