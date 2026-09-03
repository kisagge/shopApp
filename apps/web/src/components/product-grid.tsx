import { headers } from 'next/headers';
import { ProductCard } from '@shop/ui';
import { getSessionUser } from '@shop/auth/session';
import type { ProductListItem } from '~/lib/queries/products';
import { getWishlistedIds } from '~/lib/wishlist/wishlist';
import { WishlistButton } from './wishlist-button';
import { AppLink } from './app-link';

const TONES = ['sand', 'stone', 'clay', 'olive', 'mist'] as const;

/**
 * 상품 목록 그리드.
 *
 * 찜 여부를 **한 번에 가져온다.** 카드마다 물어보면 상품 수만큼 쿼리가
 * 나간다. 목록 화면이 세 곳(홈·카테고리·검색)이라 같은 코드를 세 벌 두는
 * 대신 여기로 모았다.
 */
export async function ProductGrid({
  products,
  columns = 'lg:grid-cols-4',
}: {
  products: readonly ProductListItem[];
  columns?: string;
}) {
  const viewer = await getSessionUser(await headers());
  const wishlisted = viewer
    ? await getWishlistedIds(viewer.id, products.map((p) => p.id))
    : new Set<string>();

  return (
    <ul className={`grid grid-cols-2 gap-x-3 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-9 ${columns}`}>
      {products.map((p, i) => (
        <li key={p.slug} data-product-id={p.id}>
          <ProductCard
            href={`/product/${p.slug}`}
            linkComponent={AppLink}
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
