import 'server-only';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { prisma } from '@shop/db';
import { onDisplay, sellableBrand } from './shelf';

export interface BrandDetail {
  readonly slug: string;
  readonly name: string;
  readonly logoUrl: string | null;
}

/**
 * 브랜드 하나.
 *
 * **팔 수 있는 브랜드만 준다.** 가맹점을 정지시켰는데 브랜드 화면이 계속
 * 열리면 처분이 처분이 아니다 — 목록에서만 빼고 주소로는 열리는 상태가
 * 상품 상세에서 겪은 것과 같은 뒷문이다.
 */
export const getBrandBySlug = cachedRead(
  async (slug: string): Promise<BrandDetail | null> =>
    prisma.brand.findFirst({
      where: { slug, ...sellableBrand() },
      select: { slug: true, name: true, logoUrl: true },
    }),
  { key: ['brand'], tags: [TAG.catalog], revalidate: TTL.catalog },
);

/** 사이트맵에 넣을 브랜드. 상품이 하나도 없는 브랜드는 뺀다. */
export const getSellableBrandSlugs = cachedRead(
  async (): Promise<string[]> => {
    const rows = await prisma.brand.findMany({
      where: { ...sellableBrand(), products: { some: onDisplay() } },
      select: { slug: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => r.slug);
  },
  { key: ['brand-slugs'], tags: [TAG.catalog], revalidate: TTL.catalog },
);
