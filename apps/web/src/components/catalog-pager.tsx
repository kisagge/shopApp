import Link from 'next/link';
import { CATALOG_CARRY_KEYS } from '@shop/contract';
import { getT } from '~/lib/i18n/server';

/**
 * 다음 쪽 주소.
 *
 * **지금 조건을 그대로 들고 다음 커서만 갈아 끼운다.** 조건이 풀려 버리면
 * 사용자는 같은 목록을 보고 있다고 믿은 채 다른 목록을 본다.
 *
 * 그렇게 적어 두고도 실제로는 넷만 들고 갔다 — `q`·`sort`·`minPrice`·
 * `maxPrice`. **색·사이즈·브랜드·가격대 프리셋 넷이 흘렀다.** 블랙으로
 * 좁혀 놓고 더 보기를 누르면 조용히 전체 목록의 다음 쪽이 나왔다.
 *
 * 지금은 계약에서 뽑는다(`CATALOG_CARRY_KEYS`). 조건이 하나 늘면 여기도
 * 저절로 는다.
 *
 * 값이 배열인 것(`?size=M&size=L`)은 배열 그대로 넘긴다 — 하나만 남기면
 * 고른 사이즈 중 하나가 사라진다.
 */
export function nextPageQuery(
  params: Record<string, string | string[] | undefined>,
  cursor: string,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const key of CATALOG_CARRY_KEYS) {
    const value = params[key];
    if (typeof value === 'string' && value !== '') query[key] = value;
    else if (Array.isArray(value) && value.length > 0) query[key] = value;
  }
  query['cursor'] = cursor;
  return query;
}

/**
 * 목록 아래 "더 보기".
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

  const query = nextPageQuery(params, nextCursor);

  return (
    <nav aria-label={t('catalog.showMore')} className="mt-10 flex justify-center">
      <Link
        href={{ pathname: basePath, query }}
        className="inline-flex h-12 items-center rounded-sm border border-[var(--border-strong)] px-6 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
      >
        {t('catalog.showMore')}
      </Link>
    </nav>
  );
}
