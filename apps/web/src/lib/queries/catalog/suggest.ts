import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma } from '@shop/db';
import {
  canSuggest, popularTerms, normalizeSearchTerm, SUGGEST_LIMIT,
  type SearchTermStat,
} from '@shop/core';
import { onDisplay, sellableBrand, searchWhere } from './shelf';

export interface SearchSuggestion {
  readonly kind: 'product' | 'brand' | 'category';
  readonly label: string;
  /** 고르면 갈 곳 */
  readonly href: string;
}

/**
 * 검색 자동완성.
 *
 * **지난 검색어가 아니라 카탈로그에서 만든다.** 검색 기록으로 만들면 아무도
 * 찾지 않은 상품은 영영 제안되지 않고, 문을 연 직후에는 아무것도 제안하지
 * 못한다. 우리가 파는 것에서 만들면 첫날부터 쓸모가 있다.
 *
 * 상품·브랜드·카테고리를 함께 준다 — 사람은 "코트" 라고 치면서 상품을
 * 찾기도 하고 그 갈래를 찾기도 한다.
 */
const suggestRows = cachedRead(
  async (lowered: string, limit: number) => {
    const [products, brands, categories] = await Promise.all([
      prisma.product.findMany({
        // 목록과 같은 조건을 쓴다 — 자동완성이 찾아 준 것을 눌렀는데 0건이면 안 된다
        where: { ...onDisplay(), brand: sellableBrand(), ...searchWhere(lowered) },
        orderBy: [{ soldCount: 'desc' }, { id: 'desc' }],
        take: limit,
        select: { slug: true, name: true },
      }),
      prisma.brand.findMany({
        where: { name: { contains: lowered, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 3,
        select: { slug: true, name: true },
      }),
      prisma.category.findMany({
        where: { name: { contains: lowered } },
        orderBy: { sortOrder: 'asc' },
        take: 3,
        select: { slug: true, name: true },
      }),
    ]);
    return { products, brands, categories };
  },
  { key: ['search-suggest'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export async function getSearchSuggestions(
  term: string,
  limit = SUGGEST_LIMIT,
): Promise<SearchSuggestion[]> {
  const normalized = normalizeSearchTerm(term);
  /*
   * 두 문지기를 다 지난다. canSuggest 는 "제안을 시작할 만큼 쳤는가" 를,
   * normalizeSearchTerm 은 "검색어로 쓸 수 있는가" 를 본다 — 기준이 서로
   * 달라질 수 있으므로 한쪽만 믿지 않는다.
   */
  if (normalized === null || !canSuggest(normalized)) return [];

  const lowered = normalized.toLowerCase();
  const { products, brands, categories } = await suggestRows(lowered, limit);

  /*
   * 갈래를 먼저 두고 상품을 뒤에 둔다. 갈래 하나가 상품 여럿으로 가는
   * 길이라, 찾는 것이 목록일 때 한 번에 닿는다.
   */
  const out: SearchSuggestion[] = [
    ...categories.map((c) => ({
      kind: 'category' as const,
      label: c.name,
      href: `/category/${c.slug}`,
    })),
    /*
     * **브랜드는 브랜드 화면으로 보낸다.**
     *
     * 예전에는 `/search?q=<브랜드명>` 으로 보냈는데, 그건 글자가 스치기만
     * 해도 걸리는 검색이라 남의 상품 설명에 그 이름이 있으면 함께 나왔다.
     * 브랜드로 좁히는 것은 검색이 아니라 조건이다.
     */
    ...brands.map((b) => ({
      kind: 'brand' as const,
      label: b.name,
      href: `/brand/${b.slug}`,
    })),
    ...products.map((p) => ({
      kind: 'product' as const,
      label: p.name,
      href: `/product/${p.slug}`,
    })),
  ];

  return out.slice(0, limit);
}

/**
 * 인기 검색어.
 *
 * **횟수가 아니라 서로 다른 세션 수로 센다.** 한 사람이 스무 번 친 검색어가
 * 맨 위에 오르면 그것은 사람들이 찾는 것이 아니라 한 사람이 헤맨 흔적이다.
 * 결과가 없던 검색어도 뺀다 — 권한 대로 갔더니 빈 화면인 경험이 가장 나쁘다.
 *
 * 기준을 못 넘으면 **빈 목록을 준다.** 없는 인기를 지어내지 않는다.
 */
const POPULAR_WINDOW_DAYS = 30;

const popularRows = cachedRead(
  async (limit: number): Promise<SearchTermStat[]> => {
    const since = new Date(Date.now() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    /*
     * count 는 bigint 로 온다. **캐시 앞에서 숫자로 바꿔 둔다** — 캐시는 값을
     * JSON 으로 저장하고 JSON 에는 bigint 가 없다. 그대로 두면 개발 서버에서는
     * 멀쩡하다가 빌드한 서버에서만 터진다. 실제로 그랬다.
     */
    const rows = await prisma.$queryRaw<{ term: string; sessions: bigint; hadResults: boolean }[]>`
      select
        props->>'query'                                        as term,
        count(distinct "sessionId")                            as sessions,
        bool_or(coalesce((props->>'resultCount')::int, 0) > 0) as "hadResults"
      from event_logs
      where name = 'search'
        and props->>'query' is not null
        and "receivedAt" >= ${since}
      group by 1
      order by count(distinct "sessionId") desc, 1 asc
      limit ${limit * 3}
    `;
    return rows.map((r) => ({
      term: r.term,
      sessions: Number(r.sessions),
      hadResults: r.hadResults,
    }));
  },
  { key: ['popular-searches'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

export async function getPopularSearches(limit = 6): Promise<string[]> {
  return popularTerms(await popularRows(limit), limit);
}
