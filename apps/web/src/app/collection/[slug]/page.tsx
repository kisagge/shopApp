import { notFound, permanentRedirect } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import type { Metadata } from 'next';
import { getCollection, getCollectionSlugMovedTo } from '~/lib/queries/catalog/collections';
import { ProductGrid } from '~/components/product-grid';
import { breadcrumbStructuredData, itemListStructuredData } from '@shop/core';
import { absoluteUrl } from '~/lib/urls';
import { TrackedProductList } from '~/components/tracked-product-list';
import { CollectionHero, COLLECTION_HERO_SIZES } from '~/components/collection-hero';
import { getT } from '~/lib/i18n/server';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return {};
  return {
    title: collection.title,
    ...(collection.subtitle ? { description: collection.subtitle } : {}),
  };
}

export default async function CollectionPage({ params }: Params) {
  const { slug } = await params;
  const [collection, t] = await Promise.all([getCollection(slug), getT()]);

  /*
   * 게시 기간이 아니면 없는 것으로 다룬다. 404 가 아니라 "끝난 기획전"
   * 화면을 보여 줄 수도 있지만, 그러면 지난 기획전 주소가 검색 결과에
   * 남아 살아 있는 것처럼 보인다.
   */
  // 상품과 같은 규칙이다 — 옛 주소면 새 주소로 넘기고, 그다음이 404 다
  if (!collection) {
    const movedTo = await getCollectionSlugMovedTo(slug);
    if (movedTo) permanentRedirect(`/collection/${movedTo}`);
    notFound();
  }

  /*
   * 매대와 같은 이유로 담은 것을 말한다 — 기획전은 상품 하나가 아니라
   * **고른 묶음**이 내용이다. 순서는 화면에 그리는 순서와 같다.
   */
  const jsonLd = [
    breadcrumbStructuredData([
      { name: t('nav.home'), url: absoluteUrl('/') },
      { name: t('collection.eyebrow'), url: absoluteUrl('/collections') },
      { name: collection.title, url: absoluteUrl(`/collection/${collection.slug}`) },
    ]),
    itemListStructuredData(collection.items.map((i) => absoluteUrl(`/product/${i.slug}`))),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      {/* 기획전 제목은 운영자가 입력한다 — `<` 를 이스케이프한다 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      {/*
        **화면에도 같은 길을 그린다.** 위 구조화 데이터가 이동 경로를 주장하는데
        화면에 없으면, 검색 결과에 찍히는 길과 사람이 보는 길이 갈린다. 기획전은
        홈 배너로도 들어오므로 목록으로 돌아갈 길이 화면에 있어야 하기도 하다 —
        매대·상품 상세와 같은 모양으로 둔다.
      */}
      <nav aria-label={t('nav.breadcrumb')} className="py-5">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="text-xs text-[var(--fg-muted)]">
              {t('nav.home')}
            </Link>
          </li>
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li>
            <Link href="/collections" className="text-xs text-[var(--fg-muted)]">
              {t('collection.eyebrow')}
            </Link>
          </li>
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li>
            <span aria-current="page" className="text-xs font-medium text-[var(--fg-secondary)]">
              {collection.title}
            </span>
          </li>
        </ol>
      </nav>

      <div className="py-6 md:py-8">
        <CollectionHero
          eyebrow={t('collection.eyebrow')}
          title={collection.title}
          subtitle={collection.subtitle}
          description={collection.description}
          imageUrl={collection.imageUrl}
          blurDataUrl={collection.blurDataUrl}
          imageCredit={collection.imageCredit}
          tone={collection.tone}
          sizes={COLLECTION_HERO_SIZES}
          priority
          headingLevel={1}
        />
      </div>

      <section aria-labelledby="collection-items">
        <div className="flex items-baseline justify-between gap-4 pb-4">
          {/* 머리의 제목이 이미 이 목록의 이름이다 — 같은 말을 두 번 두지 않는다 */}
          <h2 id="collection-items" className="sr-only">
            {t('collection.heading')}
          </h2>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {t('collection.count', { count: collection.itemCount })}
          </p>
          <Link href="/collections" className="text-[13px] text-[var(--fg-secondary)]">
            {t('collection.all')}
          </Link>
        </div>

        {/*
          담긴 상품이 모두 내려가면 빈 화면이 된다. 목록에서는 빠지지만
          주소를 직접 열면 여기로 오므로, 막다른 길로 두지 않고 다음 걸음을
          준다.
        */}
        {collection.items.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-[13px] text-[var(--fg-muted)]">{t('collection.emptyItems')}</p>
            <Link href="/search" className="mt-3 inline-block text-[13px]">
              {t('collection.browse')}
            </Link>
          </div>
        ) : (
          <TrackedProductList
            listId={`collection_${collection.slug}`}
            itemCount={collection.items.length}
          >
            {/* 위에 큰 머리 그림이 있다. 격자까지 미리 받으면 그것과 나눠 쓴다. */}
            <ProductGrid products={collection.items} priorityCount={0} compare />
          </TrackedProductList>
        )}
      </section>
    </div>
  );
}
