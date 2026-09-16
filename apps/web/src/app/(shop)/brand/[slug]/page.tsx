import { notFound, permanentRedirect } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import { resolvePriceRange, emptyResultReason, slugLookup } from '@shop/core';
import { getBrandBySlug } from '~/lib/queries/catalog/brands';
import { getBrandSlugMovedTo } from '~/lib/admin/manage-brand';
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

  const [loaded, t] = await Promise.all([getBrandBySlug(slug), getT()]);

  /*
   * 옛 주소면 새 주소로 넘기고, 그다음이 404 다 — 상품·기획전과 같은 규칙이다.
   *
   * **판단은 core 가 한다(slugLookup).** 되돌린 경우가 있어서다: a → b 로 바꿨다가
   * 다시 a 로 돌아오면 a 는 지금 주소이면서 기록에도 남아 있고, 기록을 먼저 보면
   * 자기 자신으로 넘기는 고리가 생긴다. 그 순서를 세 화면이 각자 적는 대신
   * 한 곳에서 정한다.
   *
   * 정지된 가맹점의 브랜드는 조회가 아예 주지 않는다 — 목록에서만 빼면 뒷문이 된다.
   */
  // 있는 브랜드면 기록을 뒤질 이유가 없다 — 멀쩡한 화면에 왕복을 하나 더 얹지 않는다
  const movedTo = loaded ? null : await getBrandSlugMovedTo(slug);
  const found = slugLookup({ current: loaded, movedTo });
  if (found.kind === 'moved') permanentRedirect(`/brand/${found.to}`);
  if (found.kind === 'gone') notFound();
  // 값을 담아 돌려주는 덕에 여기서부터는 있는 것이 확실하다
  const brand = found.value;

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

      <section aria-labelledby="brand-products-title" className="pt-8">
        {/* h1 다음이 곧바로 카드의 h3 가 되지 않게 — 제목 단계는 건너뛰지 않는다 */}
        <h2 id="brand-products-title" className="sr-only">{t('brand.all')}</h2>
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
