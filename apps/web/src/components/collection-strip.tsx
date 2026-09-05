import Link from 'next/link';
import type { CollectionCard } from '~/lib/queries/products';
import { CollectionHero } from './collection-hero';
import { getT } from '~/lib/i18n/server';

/** 홈의 기획전 줄. 배너가 데려갈 곳이 카테고리뿐이던 자리를 메운다. */
export async function CollectionStrip({
  collections,
}: {
  collections: readonly CollectionCard[];
}) {
  if (collections.length === 0) return null;
  const t = await getT();

  return (
    <section aria-labelledby="collection-title" className="px-4 pt-12 md:px-10 md:pt-20">
      <div className="mb-6 flex items-end justify-between gap-4 md:mb-7">
        <div className="flex flex-col gap-2">
          <p className="text-[10px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
            COLLECTION
          </p>
          <h2 id="collection-title" className="text-lg font-semibold tracking-tight md:text-[28px]">
            {t('collection.heading')}
          </h2>
        </div>
        <Link href="/collections" className="shrink-0 text-[13px] text-[var(--fg-secondary)]">
          {t('collection.all')}
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {collections.slice(0, 2).map((c) => (
          <li key={c.slug}>
            <Link href={`/collection/${c.slug}`} className="block no-underline">
              <CollectionHero
                eyebrow={t('collection.count', { count: c.itemCount })}
                title={c.title}
                subtitle={c.subtitle}
                imageUrl={c.imageUrl}
                imageCredit={c.imageCredit}
                tone={c.tone}
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
