import Link from 'next/link';
import { getT } from '~/lib/i18n/server';

/**
 * 목록 아래 "더 보기".
 *
 * 지금 조건을 그대로 들고 다음 커서만 갈아 끼운다. 정렬이나 가격 필터가
 * 풀려 버리면 사용자는 같은 목록을 보고 있다고 믿은 채 다른 목록을 본다.
 */
export async function CatalogPager({
  basePath,
  params,
  nextCursor,
}: {
  basePath: '/search' | `/category/${string}` | `/brand/${string}`;
  params: Record<string, string | string[] | undefined>;
  nextCursor: string | null;
}) {
  if (!nextCursor) return null;

  const t = await getT();

  const query: Record<string, string> = {};
  for (const key of ['q', 'sort', 'minPrice', 'maxPrice'] as const) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') query[key] = value;
  }
  query['cursor'] = nextCursor;

  return (
    <nav aria-label={t('catalog.showMore')} className="mt-10 flex justify-center">
      <Link
        href={{ pathname: basePath, query }}
        className="inline-flex h-12 items-center rounded-sm border border-n-300 px-6 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
      >
        {t('catalog.showMore')}
      </Link>
    </nav>
  );
}
