import type { MetadataRoute } from 'next';
import { getAllProductSlugs, getTopCategories } from '~/lib/queries/catalog/products';
import { getLiveCollections } from '~/lib/queries/catalog/collections';
import { getSellableBrandSlugs } from '~/lib/queries/catalog/brands';
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

/**
 * **요청마다 만든다. 빌드 때 만들지 않는다.**
 *
 * 이걸 붙이기 전에는 이 파일이 유일하게 빌드 중 DB 를 치는 자리였다. 가짜
 * 주소로 빌드해 보면 정확히 여기서 죽는다:
 *
 *   Error occurred prerendering page "/sitemap.xml"
 *   Can't reach database server
 *
 * 그러면 **DB 가 잠깐 흔들리는 동안 배포가 통째로 실패한다.** 사이트맵 한
 * 장 때문에 새 코드가 못 나가는 것은 값이 맞지 않는다. 그리고 이 저장소가
 * ISR 을 쓰지 않기로 한 근거가 "빌드는 DB 를 건드리지 않는다" 였는데,
 * 그 말이 이미 사실이 아닌 상태였다 — 근거를 다시 사실로 만든다.
 *
 * 크롤러가 하루에 몇 번 가져가는 주소라 매번 만들어도 부담이 없고, 조회는
 * 어차피 캐시를 지난다(lib/cache).
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [slugs, categories, collections, brands] = await Promise.all([
    getAllProductSlugs(),
    getTopCategories(),
    /*
     * **지금 열려 있는 기획전만 넣는다.** 조회가 게시 기간과 담긴 상품까지
     * 보므로, 끝났거나 빈 기획전의 주소가 새어 나가지 않는다 — 검색 결과에서
     * 들어왔더니 404 인 주소를 만들지 않는 것이 여기서 지킬 것이다.
     */
    getLiveCollections(),
    // 팔 수 있는 브랜드만. 정지된 가맹점의 주소를 색인에 남기지 않는다.
    getSellableBrandSlugs(),
  ]);
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
    ...brands.map((brand) => ({
      url: absoluteUrl(`/brand/${brand}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...collections.map((collection) => ({
      url: absoluteUrl(`/collection/${collection.slug}`),
      lastModified: now,
      changeFrequency: 'weekly' as const,
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
