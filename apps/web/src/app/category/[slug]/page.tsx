import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ProductCard } from '@shop/ui';
import { getCategoryWithChildren, getProductsByCategory } from '~/lib/queries/products';
import { TrackedProductList } from '~/components/tracked-product-list';
import { AppLink } from '~/components/app-link';

export const dynamic = 'force-dynamic';

const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryWithChildren(slug);
  return { title: category?.name ?? '카테고리' };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const [category, products] = await Promise.all([
    getCategoryWithChildren(slug),
    getProductsByCategory(slug, 48),
  ]);
  if (!category) notFound();

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
          <span className="tnum font-semibold text-[var(--fg-secondary)]">{products.length}</span>개의 상품
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

      <section aria-label="상품 목록" className="pt-8">
        {products.length === 0 ? (
          <p className="py-24 text-center text-sm text-[var(--fg-muted)]">
            아직 등록된 상품이 없습니다.
          </p>
        ) : (
          <TrackedProductList listId={`category_${category.slug}`} itemCount={products.length}>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-9 lg:grid-cols-4">
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
        )}
      </section>
    </div>
  );
}
