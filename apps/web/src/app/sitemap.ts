import type { MetadataRoute } from 'next';
import { getAllProductSlugs, getTopCategories } from '~/lib/queries/products';
import { absoluteUrl } from '~/lib/urls';

/**
 * sitemap.xml.
 *
 * **매대에 보이는 것만 넣는다.** 목록을 만드는 조회가 스토어프론트와 같은
 * 조건(공개 상태 + 게시됨)을 쓰므로, 숨긴 상품의 주소가 새어 나가지 않는다.
 * 검색 화면은 넣지 않는다 — 검색어마다 다른 주소가 되어 같은 상품이 여러
 * 번 잡힌다.
 *
 * 상품이 수만 개가 되면 쪽을 나눠야 하지만(sitemap index), 지금 규모에서는
 * 한 장이면 된다. 나눌 때가 오면 그때 나눈다.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, categories] = await Promise.all([getAllProductSlugs(), getTopCategories()]);
  const now = new Date();

  return [
    {
      url: absoluteUrl('/'),
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    ...categories.map((category) => ({
      url: absoluteUrl(`/category/${category.slug}`),
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
    ...slugs.map((slug) => ({
      url: absoluteUrl(`/product/${slug}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
