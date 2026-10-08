import 'server-only';
import { prisma } from '@shop/db';
import { isOnDisplay } from '@shop/core';

/**
 * 찜.
 *
 * 옵션이 아니라 **상품 단위**로 담는다. 찜은 "이 물건이 마음에 든다" 는
 * 표시이지 "이 사이즈를 사겠다" 는 결정이 아니다. 사이즈는 살 때 고르면 된다.
 *
 * 추가·삭제를 토글 하나로 두지 않고 나눈 이유: 토글은 같은 요청이 두 번
 * 가면 원래대로 돌아간다. 연타나 재시도에서 실제로 일어나는 일이고,
 * 그러면 화면과 서버가 어긋난다. 넣기와 빼기는 **몇 번을 해도 결과가 같다.**
 */

export const MAX_WISHLIST_ITEMS = 200;

export interface WishlistProduct {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly price: number;
  readonly listPrice: number;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly soldOut: boolean;
  /** 판매가 내려간 상품. 목록에서 지우지 않고 표시만 한다 */
  readonly unavailable: boolean;
  readonly addedAt: Date;
}

export class WishlistError extends Error {
  readonly vars = { max: MAX_WISHLIST_ITEMS } as const;

  constructor(readonly code: 'PRODUCT_NOT_FOUND' | 'TOO_MANY', readonly status: number) {
    super(code === 'TOO_MANY' ? 'err.wishlist.tooMany' : 'err.product.notFound');
    this.name = 'WishlistError';
  }
}

/** 찜에 넣는다. 이미 있으면 아무 일도 없다. */
export async function addToWishlist(userId: string, productId: string): Promise<void> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new WishlistError('PRODUCT_NOT_FOUND', 404);

  const count = await prisma.wishlistItem.count({ where: { userId } });
  if (count >= MAX_WISHLIST_ITEMS) throw new WishlistError('TOO_MANY', 409);

  // 유니크 제약이 중복을 막는다. 이미 있으면 조용히 넘어간다 —
  // "이미 찜했습니다" 는 오류가 아니라 원하던 상태다.
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId, productId } },
    update: {},
    create: { userId, productId },
  });
}

/** 찜에서 뺀다. 없어도 아무 일도 없다. */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await prisma.wishlistItem.deleteMany({ where: { userId, productId } });
}

/**
 * 찜 목록.
 *
 * 판매가 내려간 상품도 지우지 않고 표시만 바꾼다. 조용히 사라지면
 * 사용자는 자기가 찜을 지운 줄 안다.
 *
 * **매대에 서 있는가는 core 가 판단한다**(isOnDisplay). 여기서 손으로 적어 두었더니 한 칸이 빠져
 * 있었다 — 검수 대기(PENDING_REVIEW)를 "살 수 있음" 으로 읽어서, 가맹점이 고치려고 상품을 내린
 * 사이에 찜 목록은 멀쩡한 카드를 그렸다. 누르면 매대 조회가 걸러 404 다. 바로 그 어긋남 때문에
 * 판단을 한 곳으로 모은 것이다(core 주석: 셋이 각자 적었더니 하나가 다른 답을 냈다).
 */
export async function getWishlist(userId: string): Promise<WishlistProduct[]> {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_WISHLIST_ITEMS,
    select: {
      createdAt: true,
      product: {
        select: {
          id: true, slug: true, name: true, status: true,
          listPrice: true, salePrice: true, deletedAt: true, publishedAt: true,
          brand: { select: { name: true, merchant: { select: { status: true } } } },
          images: { select: { url: true, alt: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
          variants: { where: { isActive: true }, select: { stock: true } },
        },
      },
    },
  });

  return rows.map((row) => {
    const p = row.product;
    const image = p.images[0];
    return {
      productId: p.id,
      slug: p.slug,
      name: p.name,
      brand: p.brand.name,
      price: p.salePrice ?? p.listPrice,
      listPrice: p.listPrice,
      imageUrl: image?.url ?? null,
      imageAlt: image?.alt ?? null,
      soldOut: p.variants.length > 0 && p.variants.every((v) => v.stock <= 0),
      unavailable: !isOnDisplay({
        deletedAt: p.deletedAt,
        publishedAt: p.publishedAt,
        status: p.status,
        // 자사 브랜드면 승인을 물을 상대가 없다
        merchantStatus: p.brand.merchant?.status ?? null,
      }),
      addedAt: row.createdAt,
    };
  });
}

/**
 * 이 사용자가 찜한 상품 id 들.
 *
 * 목록 화면이 카드마다 따로 물어보면 상품 수만큼 쿼리가 나간다.
 * 한 번에 받아 두고 카드는 그 집합만 본다.
 */
export async function getWishlistedIds(
  userId: string,
  productIds: readonly string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set();
  const rows = await prisma.wishlistItem.findMany({
    where: { userId, productId: { in: [...productIds] } },
    select: { productId: true },
  });
  return new Set(rows.map((r) => r.productId));
}
