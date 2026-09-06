import Link from 'next/link';
import type { Metadata } from 'next';
import { getLiveCollections } from '~/lib/queries/catalog/collections';
import { CollectionHero } from '~/components/collection-hero';
import { getT } from '~/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('collection.heading') };
}

export default async function CollectionsPage() {
  const [t, collections] = await Promise.all([getT(), getLiveCollections()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">
          COLLECTION
        </p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {t('collection.heading')}
        </h1>
      </header>

      {collections.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-[13px] text-[var(--fg-muted)]">{t('collection.empty')}</p>
          <Link href="/search" className="mt-3 inline-block text-[13px]">
            {t('collection.browse')}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {collections.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/collection/${c.slug}`}
                className="block no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <CollectionHero
                  eyebrow={t('collection.count', { count: c.itemCount })}
                  title={c.title}
                  subtitle={c.subtitle}
                  imageUrl={c.imageUrl}
                  imageCredit={c.imageCredit}
                  tone={c.tone}
                  sizes="(min-width: 768px) 50vw, 100vw" 
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
