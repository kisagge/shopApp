import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import { emptyResultHint } from '@shop/core';
import { getCategoryWithChildren, searchProducts } from '~/lib/queries/products';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { CatalogControls } from '~/components/catalog-controls';
import { CatalogPager } from '~/components/catalog-pager';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryWithChildren(slug);
  return { title: category?.name ?? '카테고리' };
}

export default async function CategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = catalogQuerySchema.parse(raw);

  const [category, page] = await Promise.all([
    getCategoryWithChildren(slug),
    searchProducts({
      categorySlug: slug,
      sort: query.sort,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      cursor: query.cursor,
    }),
  ]);
  if (!category) notFound();

  const products = page.items;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <nav aria-label="현재 위치" className="py-5">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="text-xs text-[var(--fg-muted)]">홈</Link></li>
          {category.parent && (
            <>
              <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
              <li>
                <Link href={`/category/${category.parent.slug}`} className="text-xs text-[var(--fg-muted)]">
                  {category.parent.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li><span aria-current="page" className="text-xs font-medium text-[var(--fg-secondary)]">{category.name}</span></li>
        </ol>
      </nav>

      <div className="flex items-baseline gap-3 border-b border-[var(--border)] pb-6">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{category.name}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {/* 이 쪽에 담긴 수가 아니라 조건에 맞는 전체 수 */}
          <span className="tnum font-semibold text-[var(--fg-secondary)]">
            {(page.total ?? products.length).toLocaleString('ko-KR')}
          </span>개의 상품
        </p>
      </div>

      {category.children.length > 0 && (
        <nav aria-label="하위 카테고리" className="border-b border-[var(--border)]">
          <ul className="flex gap-1 overflow-x-auto">
            <li>
              <Link
                href={`/category/${category.slug}`}
                aria-current="page"
                className="inline-flex h-12 items-center px-4 text-sm font-semibold shadow-[inset_0_-2px_0_var(--fg)]"
              >
                전체
              </Link>
            </li>
            {category.children.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className="inline-flex h-12 items-center px-4 text-sm text-[var(--fg-muted)]">
                  {c.name}
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
          total={page.total}
        />
      </div>

      <section aria-label="상품 목록" className="pt-8">
        {products.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-24">
            <p className="text-[15px] font-medium">조건에 맞는 상품이 없습니다</p>
            <p className="text-[13px] text-[var(--fg-muted)]">
              {emptyResultHint({
                hasQuery: false,
                hasPriceRange: query.minPrice !== undefined || query.maxPrice !== undefined,
                hasCategory: true,
              })}
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
