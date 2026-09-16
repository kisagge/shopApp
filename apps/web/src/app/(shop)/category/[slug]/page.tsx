import { notFound, permanentRedirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import type { Metadata } from 'next';
import { catalogQuerySchema } from '@shop/contract';
import {
  resolvePriceRange, emptyResultReason, slugLookup,
  breadcrumbStructuredData, itemListStructuredData,
} from '@shop/core';
import { getCategoryWithChildren } from '~/lib/queries/catalog/products';
import { getCategorySlugMovedTo } from '~/lib/admin/manage-category';
import { searchProducts, getFacets, getBrandOptions } from '~/lib/queries/catalog/search';
import { ProductGrid } from '~/components/product-grid';
import { absoluteUrl } from '~/lib/urls';
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
  const { slug } = await params;
  const [category, t] = await Promise.all([getCategoryWithChildren(slug), getT()]);
  return {
    title: category ? t.category(category.slug, category.name) : t('nav.categoriesPlain'),
  };
}

export default async function CategoryPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const raw = await searchParams;
  const query = catalogQuerySchema.parse(raw);
  // 손으로 친 숫자와 구간 프리셋 중 어느 쪽이 이기는지는 core 가 정한다
  const price = resolvePriceRange(query);

  const [loaded, page, facets, brands] = await Promise.all([
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
  /*
   * 옛 주소면 새 주소로 넘기고, 그다음이 404 다 — 상품·기획전·브랜드와 같은 규칙이다.
   * 순서(지금 주소를 먼저 본다)는 core 가 정한다: 되돌린 경우에 자기 자신으로
   * 넘기는 고리가 생기지 않게.
   */
  const found = slugLookup({
    current: loaded,
    // 있는 갈래면 기록을 뒤질 이유가 없다
    movedTo: loaded ? null : await getCategorySlugMovedTo(slug),
  });
  if (found.kind === 'moved') permanentRedirect(`/category/${found.to}`);
  if (found.kind === 'gone') notFound();
  // 값을 담아 돌려주는 덕에 여기서부터는 있는 것이 확실하다
  const category = found.value;

  const t = await getT();
  const products = page.items;
  const title = t.category(category.slug, category.name);

  /*
   * **이 화면이 무엇을 담고 있는지 말한다.**
   *
   * 상품 화면은 `Product` 로 자기를 설명하는데, 그것을 모아 보여 주는 매대는
   * 아무 말도 하지 않고 있었다 — 검색엔진에는 링크만 잔뜩 있는 문서다.
   *
   * 빵부스러기는 **바로 아래 화면에 그리는 것과 같은 순서**로 만든다. 둘이
   * 다르면 사람이 보는 길과 검색 결과에 찍히는 길이 갈린다.
   */
  const jsonLd = [
    breadcrumbStructuredData([
      { name: t('nav.home'), url: absoluteUrl('/') },
      ...(category.parent
        ? [
            {
              name: t.category(category.parent.slug, category.parent.name),
              url: absoluteUrl(`/category/${category.parent.slug}`),
            },
          ]
        : []),
      { name: title, url: absoluteUrl(`/category/${category.slug}`) },
    ]),
    itemListStructuredData(products.map((p) => absoluteUrl(`/product/${p.slug}`))),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      {/*
        상품 화면과 같은 이유로 `<` 를 이스케이프한다 — 상품명·카테고리명은
        운영자가 입력하는 값이라 </script> 가 들어올 수 있다.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

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
                  {t.category(category.parent.slug, category.parent.name)}
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
          <ul className="scrollbar-none flex gap-1 overflow-x-auto">
            <li className="shrink-0">
              <Link
                href={`/category/${category.slug}`}
                aria-current="page"
                className="inline-flex h-12 items-center whitespace-nowrap px-4 text-sm font-semibold shadow-[inset_0_-2px_0_var(--fg)]"
              >
                {t('category.all')}
              </Link>
            </li>
            {category.children.map((c) => (
              <li key={c.slug} className="shrink-0">
                <Link href={`/category/${c.slug}`} className="inline-flex h-12 items-center whitespace-nowrap px-4 text-sm text-[var(--fg-muted)]">
                  {t.category(c.slug, c.name)}
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
          /*
           * **개수는 제목이 이미 말한다.** 바로 위에 "아우터 상품 13개" 가
           * 있는데 좁혀 보기 옆에 "총 13개" 를 또 두면, 읽는 사람은 두 수가
           * 다른 것을 세는 줄 알고 견주게 된다. 브랜드·검색 화면은 제목에
           * 개수가 없어서 그쪽에서는 이 자리가 유일한 답이다.
           */
          total={null}
          facets={facets}
          selected={{ color: query.color, size: query.size }}
          brands={brands}
          selectedBrands={query.brand}
        />
      </div>

      {/*
        **제목 단계를 건너뛰지 않는다.** h1 다음이 곧바로 상품 카드의 h3 라, 제목으로 훑어 내려가는
        사람에게 목록의 소속이 흐려졌다. 홈·기획전은 이미 sr-only h2 를 두고 있다.
      */}
      <section aria-labelledby="product-list-title" className="pt-8">
        <h2 id="product-list-title" className="sr-only">{t('catalog.productList')}</h2>
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
            <ProductGrid products={products} compare
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
