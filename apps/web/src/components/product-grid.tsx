import { headers } from 'next/headers';
import { ProductCard } from '@shop/ui';
import { getSessionUser } from '@shop/auth/session';
import { getLocale } from '~/lib/i18n/server';
import type { ProductListItem } from '~/lib/queries/products';
import { getWishlistedIds } from '~/lib/wishlist/wishlist';
import { WishlistButton } from './wishlist-button';
import { AppLink } from './app-link';
import { AppImage } from './app-image';

const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

/**
 * 상품 목록 그리드.
 *
 * 찜 여부를 **한 번에 가져온다.** 카드마다 물어보면 상품 수만큼 쿼리가
 * 나간다. 목록 화면이 세 곳(홈·카테고리·검색)이라 같은 코드를 세 벌 두는
 * 대신 여기로 모았다.
 */
/**
 * 화면 폭에 따른 카드 이미지의 표시 크기.
 *
 * 기본 격자는 모바일 2열 · md 3열 · lg 4열이다. **이 값이 격자와 어긋나면
 * 최적화가 헛돈다** — 실제보다 크게 적으면 큰 파일이 오고, 작게 적으면
 * 흐릿하게 나온다. 열 수를 바꾸는 화면은 이 값도 함께 넘긴다.
 */
const DEFAULT_SIZES = '(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw';

/**
 * 첫 화면에 보이는 카드 수. 이만큼만 먼저 받는다.
 *
 * 목록 화면(카테고리·검색·브랜드)은 격자가 맨 위라 이 값이 맞다.
 */
const ABOVE_FOLD = 4;

export async function ProductGrid({
  products,
  columns = 'lg:grid-cols-4',
  imageSizes = DEFAULT_SIZES,
  priorityCount = ABOVE_FOLD,
}: {
  products: readonly ProductListItem[];
  columns?: string;
  imageSizes?: string;
  /**
   * 미리 받을 카드 수.
   *
   * **격자가 화면 맨 위가 아니면 0 이어야 한다.** 홈은 배너가 먼저라
   * 격자가 한참 아래에 있는데, 그런데도 넉 장을 미리 받기 목록에 올리고
   * 있었다 — 배너와 대역폭을 나눠 쓰면서 정작 화면에는 안 보이는 것들이다.
   * 미리 받기는 화면의 가장 큰 그림 하나를 위한 것이지, 목록이 아니다.
   */
  priorityCount?: number;
}) {
  const [viewer, locale] = await Promise.all([getSessionUser(await headers()), getLocale()]);
  const wishlisted = viewer
    ? await getWishlistedIds(viewer.id, products.map((p) => p.id))
    : new Set<string>();

  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-9 ${columns}`}>
      {products.map((p, i) => (
        <li key={p.slug} data-product-id={p.id}>
          <ProductCard
            locale={locale}
            href={`/product/${p.slug}`}
            linkComponent={AppLink}
            imageComponent={AppImage}
            imageSizes={imageSizes}
            /*
             * 앞의 몇 장만 먼저 받는다. 목록 전체에 주면 브라우저가 무엇을
             * 먼저 그릴지 알 수 없어져서 붙이지 않은 것과 같아진다.
             */
            imagePriority={i < priorityCount}
            brand={p.brand}
            name={p.name}
            price={p.price}
            listPrice={p.listPrice}
            discountPercent={p.discountPercent}
            rating={p.rating}
            reviewCount={p.reviewCount}
            soldOut={p.soldOut}
            isNew={p.isNew}
            image={p.imageUrl && p.imageAlt ? { src: p.imageUrl, alt: p.imageAlt } : undefined}
            placeholderTone={TONES[i % TONES.length] ?? 'sand'}
            wishlistButton={
              <WishlistButton
                productId={p.id}
                productName={p.name}
                initialWishlisted={wishlisted.has(p.id)}
                loggedIn={viewer !== null}
              />
            }
          />
        </li>
      ))}
    </ul>
  );
}
