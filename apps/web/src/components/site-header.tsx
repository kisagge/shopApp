import Link from 'next/link';
import { getTopCategories } from '~/lib/queries/products';
import { SessionNav } from './session-nav';

/** 모든 페이지가 쓰는 헤더. 카테고리는 서버에서 읽는다. */
export async function SiteHeader() {
  const categories = await getTopCategories();

  return (
    <header className="border-b border-[var(--border)]">
      <div className="mx-auto flex h-13 w-full max-w-[1280px] items-center justify-between gap-6 px-4 md:h-19 md:px-10">
        <p className="font-serif text-[21px] font-medium tracking-[0.18em] md:text-[25px]">
          <Link href="/" className="text-[var(--fg)] no-underline">PLAIN</Link>
        </p>

        <nav aria-label="주요 카테고리" className="hidden flex-1 md:block">
          <ul className="flex">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-11 items-center px-4 text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SessionNav />
      </div>
    </header>
  );
}
