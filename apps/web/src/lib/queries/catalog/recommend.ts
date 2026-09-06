import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma } from '@shop/db';
import { mergeRecommendations } from '@shop/core';
import {
  onDisplay, sellableBrand, listSelect, toListItem, type ProductListItem,
} from './shelf';
import { getFeaturedProducts } from './products';

/**
 * 이 상품을 본 사람이 함께 본 것.
 *
 * 같은 세션에서 본 상품을 짝지어 세고, 많이 겹친 순으로 준다.
 *
 * **원본 이벤트를 직접 읽는다.** 미리 접어 두는 표를 만들 수도 있지만,
 * 지금 규모에서는 배치 하나와 표 하나를 더 두는 값이 없다. 대신 창을 30일로
 * 자른다 — 오래된 취향은 지금 추천에 도움이 안 되고, 원본은 90일 뒤 롤업이
 * 지우므로 이 창은 늘 안에 있다.
 *
 * **여기서는 매대 조건을 걸지 않는다.** id 만 세고, 실제 상품은 아래에서
 * 매대 조건과 함께 다시 읽는다 — 조건을 두 곳에 적으면 한쪽만 낡는다.
 */
const COVIEW_WINDOW_DAYS = 30;

const coViewedIds = cachedRead(
  async (productId: string, limit: number): Promise<string[]> => {
    const since = new Date(Date.now() - COVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<{ productId: string }[]>`
      select other."productId" as "productId"
      from event_logs mine
      join event_logs other
        on other."sessionId" = mine."sessionId"
       and other."productId" is not null
       and other."productId" <> mine."productId"
       and other.name = 'view_item'
      where mine.name = 'view_item'
        and mine."productId" = ${productId}
        and mine."receivedAt" >= ${since}
      group by other."productId"
      order by count(distinct other."sessionId") desc, other."productId" asc
      limit ${limit}
    `;
    return rows.map((r) => r.productId);
  },
  { key: ['co-viewed'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

/**
 * 추천으로 보여 줄 상품.
 *
 * 함께 본 기록을 앞에 두고, 모자라면 **같은 카테고리의 잘 팔리는 것**으로
 * 채운다. 기록은 사람이 다녀가야 쌓이므로 새 상품에는 없고, 문을 연 직후에는
 * 어느 상품에도 없다 — 그때마다 자리가 사라지면 있는지 없는지를 사용자가
 * 예측할 수 없다.
 */
export interface Recommendations {
  readonly items: readonly ProductListItem[];
  /**
   * 함께 본 기록이 실제로 들어갔는가.
   *
   * **제목이 이 값에 따라 달라진다.** 인기 상품으로 채운 줄에 "함께 본 상품"
   * 이라고 붙이면 사실이 아닌 말을 하는 것이다 — 추천은 근거를 말할 때만
   * 믿을 만하다.
   */
  readonly fromCoView: boolean;
}

export async function getRecommendations(input: {
  readonly productId: string;
  readonly categorySlug: string;
  readonly limit: number;
}): Promise<Recommendations> {
  const { productId, categorySlug, limit } = input;

  // 걸러질 것을 감안해 넉넉히 뽑는다. 숨긴 상품이 섞이면 그만큼 줄어든다.
  const over = limit * 2;
  const [ids, shelfIds] = await Promise.all([
    coViewedIds(productId, over),
    shelfIdsFor(categorySlug),
  ]);

  const [primaryRows, shelfRows, popularRows] = await Promise.all([
    ids.length === 0 ? [] : onDisplayByIds(ids),
    shelfIds.length === 0 ? [] : shelfBestSellers(shelfIds, over),
    /*
     * 마지막 단. 매대까지 봐도 모자랄 때가 있다 — 상품이 하나뿐인 갈래가
     * 그렇다. 실제로 여덟 상품 중 넷에서 줄이 통째로 사라졌다.
     */
    getFeaturedProducts(over),
  ]);

  const now = Date.now();

  /*
   * 함께 본 순서는 위에서 정해졌는데 DB 는 그 순서를 지켜 주지 않는다.
   * 최근 본 상품에서와 같은 이유로 여기서 다시 세운다.
   */
  const bySlot = new Map(primaryRows.map((r) => [r.id, r]));
  const primary = ids.flatMap((id) => {
    const row = bySlot.get(id);
    return row ? [toListItem(row, now)] : [];
  });

  const items = mergeRecommendations({
    primary,
    fallback: [...shelfRows.map((r) => toListItem(r, now)), ...popularRows],
    excludeId: productId,
    limit,
  });

  const coViewed = new Set(primary.map((p) => p.id));
  return { items, fromCoView: items.some((i) => coViewed.has(i.id)) };
}

const onDisplayByIds = (ids: readonly string[]) =>
  prisma.product.findMany({
    where: { id: { in: [...ids] }, ...onDisplay(), brand: sellableBrand() },
    select: listSelect,
  });

/**
 * 같은 **매대**의 잘 팔리는 것.
 *
 * 잎 카테고리만 보면 안 된다 — 코트에는 코트가 하나뿐이라 자기 자신을
 * 빼고 나면 아무것도 남지 않는다. 실제로 그렇게 만들었더니 여덟 상품 중
 * 넷에서 추천 줄이 통째로 사라졌다.
 *
 * 그래서 **같은 상위 카테고리 전체**로 본다. 사람이 "아우터 더 보기" 라고
 * 생각하는 범위가 그쪽이지, "코트 더 보기" 가 아니다.
 */
const shelfIdsFor = cachedRead(
  async (categorySlug: string): Promise<string[]> => {
    const category = await prisma.category.findUnique({
      where: { slug: categorySlug },
      select: { id: true, parentId: true, children: { select: { id: true } } },
    });
    if (!category) return [];

    // 상위가 있으면 그 상위와 형제들, 없으면 자기와 자식들
    if (category.parentId === null) {
      return [category.id, ...category.children.map((c) => c.id)];
    }
    const siblings = await prisma.category.findMany({
      where: { parentId: category.parentId },
      select: { id: true },
    });
    return [category.parentId, ...siblings.map((c) => c.id)];
  },
  { key: ['shelf-ids'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

const shelfBestSellers = cachedRead(
  (categoryIds: readonly string[], limit: number) =>
    prisma.product.findMany({
      where: {
        ...onDisplay(),
        brand: sellableBrand(),
        categoryId: { in: [...categoryIds] },
      },
      orderBy: [{ soldCount: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: listSelect,
    }),
  { key: ['shelf-best'], tags: [TAG.catalog], revalidate: TTL.catalog },
);
