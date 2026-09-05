import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getCollection } from '~/lib/queries/products';
import { ProductGrid } from '~/components/product-grid';
import { TrackedProductList } from '~/components/tracked-product-list';
import { CollectionHero } from '~/components/collection-hero';
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
  if (!collection) notFound();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <div className="py-6 md:py-8">
        <CollectionHero
          eyebrow={t('collection.eyebrow')}
          title={collection.title}
          subtitle={collection.subtitle}
          description={collection.description}
          imageUrl={collection.imageUrl}
          imageCredit={collection.imageCredit}
          tone={collection.tone}
          sizes="100vw"
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
            <ProductGrid products={collection.items} priorityCount={0} />
          </TrackedProductList>
        )}
      </section>
    </div>
  );
}
