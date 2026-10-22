import Link from 'next/link';
import type { Metadata } from 'next';
import { getCategoryTree } from '~/lib/queries/catalog/products';
import { getT } from '~/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('category.index') };
}

/**
 * 갈래 전체.
 *
 * **머리와 발은 최상위만 보여 준다.** `아우터 > 코트` 같은 하위 갈래는 상품 화면의 이동
 * 경로나 검색으로 들어가야만 만났다 — 사이트맵에는 진작 들어가 있던 주소들인데(크롤러는
 * 아는데 사람은 모르는 자리) 모아 볼 화면이 없었다.
 *
 * **빈 갈래는 빼고 상품 수를 적는다.** 눌러 보고 나서 빈 화면을 만나지 않게 하는 것이고,
 * 그 규칙은 조회가 쥔다(getCategoryTree).
 */
export default async function CategoriesPage() {
  const [t, tree] = await Promise.all([getT(), getCategoryTree()]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">CATEGORY</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">{t('category.index')}</h1>
      </header>

      {tree.length === 0 ? (
        <div className="py-20 text-center">
          <p className="text-[13px] text-[var(--fg-muted)]">{t('category.empty')}</p>
          <Link href="/search" className="mt-3 inline-block text-[13px]">
            {t('collection.browse')}
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((node) => (
            <li key={node.slug}>
              {/*
                제목 자체가 그 갈래로 가는 길이다 — 상위 갈래에도 상품이 달려 있고,
                제목을 죽은 글자로 두면 "아우터 전체" 로 갈 방법이 사라진다.
              */}
              <h2 className="text-[15px] font-medium">
                <Link href={`/category/${node.slug}`} className="text-[var(--fg)] no-underline hover:underline">
                  {t.category(node.slug, node.name)}
                </Link>{' '}
                <span className="tnum text-[12px] font-normal text-[var(--fg-muted)]">
                  {t('catalog.count', { count: node.count })}
                </span>
              </h2>

              {node.children.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-l border-[var(--border)] pl-3">
                  {node.children.map((child) => (
                    <li key={child.slug}>
                      <Link
                        href={`/category/${child.slug}`}
                        className="inline-flex h-8 items-center gap-1.5 text-[13px] text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)] hover:underline"
                      >
                        {t.category(child.slug, child.name)}
                        <span className="tnum text-[11px] text-[var(--fg-muted)]">
                          {t('catalog.count', { count: child.count })}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
