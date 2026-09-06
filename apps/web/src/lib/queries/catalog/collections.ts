import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma } from '@shop/db';
import { isLive, hasVisibleItems } from '@shop/core';
import {
  onDisplay, sellableBrand, listSelect, toListItem, type ProductListItem,
} from './shelf';

export interface CollectionCard {
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly blurDataUrl: string | null;
  readonly imageCredit: string | null;
  readonly tone: string;
  readonly itemCount: number;
}

export interface CollectionDetail extends CollectionCard {
  readonly description: string | null;
  readonly items: readonly ProductListItem[];
}

/** 캐시를 지나온 날짜를 되살린다. 정책은 Date 를 요구하고 그 요구가 옳다. */
const reviveWindow = <T extends { startsAt: Date | string | null; endsAt: Date | string | null }>(
  row: T,
) => ({
  ...row,
  startsAt: row.startsAt === null ? null : new Date(row.startsAt),
  endsAt: row.endsAt === null ? null : new Date(row.endsAt),
});

/**
 * 기획전 목록.
 *
 * 배너와 같은 판단이다 — **게시 기간 판정은 캐시 밖에 둔다.** 걸러진 결과를
 * 캐싱하면 시작·종료 시각이 캐시 수명만큼 늦어져서, 끝난 기획전이 계속
 * 걸려 있거나 시작한 기획전이 안 뜬다.
 *
 * 담긴 수는 **매대 조건을 지난 것만** 센다. 내려간 상품이 그대로 세어지면
 * 목록에는 있는데 열면 빈 기획전이 된다.
 */
const collectionRows = cachedRead(
  () =>
    prisma.collection.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        slug: true, title: true, subtitle: true, imageUrl: true, imageAlt: true,
        blurDataUrl: true,
        imageCredit: true, tone: true, isActive: true, startsAt: true, endsAt: true,
        _count: { select: { items: { where: { product: { ...onDisplay(), brand: sellableBrand() } } } } },
      },
    }),
  { key: ['collections'], tags: [TAG.catalog, TAG.collections], revalidate: TTL.collections },
);

/** 지금 노출할 기획전. 빈 것은 빼고 준다. */
export async function getLiveCollections(now = new Date()): Promise<CollectionCard[]> {
  const rows = await collectionRows();
  return rows.flatMap((c) =>
    isLive(reviveWindow(c), now) && hasVisibleItems(c._count.items)
      ? [{
          slug: c.slug, title: c.title, subtitle: c.subtitle,
          imageUrl: c.imageUrl, imageAlt: c.imageAlt, blurDataUrl: c.blurDataUrl,
          imageCredit: c.imageCredit,
          tone: c.tone, itemCount: c._count.items,
        }]
      : [],
  );
}

/**
 * 기획전 하나.
 *
 * **담긴 상품에도 매대 조건을 그대로 건다.** 기획전이 숨긴 상품으로 들어가는
 * 뒷문이 되면 상세 화면에 조건을 건 뜻이 없어진다 — 최근 본 상품에서 배운
 * 것과 같은 자리다. 조건은 관계 조회에 건다: 순서는 담긴 표의 sortOrder 가
 * 정하므로 걸러 내도 흐트러지지 않는다.
 */
const collectionRow = cachedRead(
  (slug: string) =>
    prisma.collection.findUnique({
      where: { slug },
      select: {
        slug: true, title: true, subtitle: true, description: true,
        imageUrl: true, imageAlt: true, blurDataUrl: true, imageCredit: true, tone: true,
        isActive: true, startsAt: true, endsAt: true,
        items: {
          where: { product: { ...onDisplay(), brand: sellableBrand() } },
          orderBy: { sortOrder: 'asc' },
          select: { product: { select: listSelect } },
        },
      },
    }),
  { key: ['collection'], tags: [TAG.catalog, TAG.collections], revalidate: TTL.collections },
);

export async function getCollection(
  slug: string,
  now = new Date(),
): Promise<CollectionDetail | null> {
  const row = await collectionRow(slug);
  if (!row || !isLive(reviveWindow(row), now)) return null;

  const millis = now.getTime();
  const items = row.items.map((i) => toListItem(i.product, millis));

  return {
    slug: row.slug, title: row.title, subtitle: row.subtitle,
    description: row.description, imageUrl: row.imageUrl, imageAlt: row.imageAlt,
    blurDataUrl: row.blurDataUrl, imageCredit: row.imageCredit, tone: row.tone, itemCount: items.length, items,
  };
}
