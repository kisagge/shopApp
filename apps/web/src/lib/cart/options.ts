import 'server-only';
import { prisma } from '@shop/db';
import { variantUnavailable, won } from '@shop/core';
import type { CartOptionsResponse } from '@shop/contract';
import { variantStateOf } from '~/lib/queries/cart';

/**
 * 장바구니 한 줄의 **바꿀 수 있는 옵션들** — 같은 상품의 다른 옵션.
 *
 * **캐시를 거치지 않는다.** 상품 화면의 조회는 매대 캐시를 쓰고, 그 캐시는 재고가 한
 * 시간까지 늦을 수 있다고 스스로 적어 두었다. 여기는 "L 이 품절이라 M 으로 바꾸려는"
 * 자리라 재고가 틀리면 바꾼 줄이 곧바로 다시 품절로 뜬다. 옵션 몇 개를 읽는 일이라
 * 캐시가 아낄 것도 크지 않다.
 *
 * 목록은 상품 화면과 같다 — **판매 중인 옵션만.** 다만 지금 줄의 옵션은 판매가 멈췄어도
 * 넣는다. 고르는 칸이 지금 값을 보여 주지 못하면 무엇에서 바꾸는지 모른다.
 *
 * 상품이 사라졌으면 null — 바꿀 것이 없다.
 */
export async function getCartOptions(variantId: string): Promise<CartOptionsResponse | null> {
  const current = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { productId: true },
  });
  if (!current) return null;

  const product = await prisma.product.findUnique({
    where: { id: current.productId },
    select: {
      id: true, name: true, listPrice: true, salePrice: true, status: true, deletedAt: true,
      brand: { select: { name: true, merchant: { select: { status: true } } } },
      images: { select: { url: true, blurDataUrl: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      variants: {
        where: { OR: [{ isActive: true }, { id: variantId }] },
        orderBy: { sku: 'asc' },
        select: { id: true, label: true, stock: true, isActive: true, priceOverride: true },
      },
    },
  });
  if (!product || product.deletedAt !== null || product.status === 'DRAFT') return null;

  const listPrice = won(product.listPrice);
  const base = product.salePrice === null ? listPrice : won(product.salePrice);

  return {
    productId: product.id,
    productName: product.name,
    brandName: product.brand.name,
    listPrice,
    imageUrl: product.images[0]?.url ?? null,
    blurDataUrl: product.images[0]?.blurDataUrl ?? null,
    options: product.variants.map((v) => ({
      variantId: v.id,
      label: v.label,
      unitPrice: v.priceOverride === null ? base : won(v.priceOverride),
      stock: v.stock,
      // 담을 수 있고 재고가 있어야 고를 수 있다 — 판정은 견적과 한 벌이다
      available: v.stock > 0 && variantUnavailable(variantStateOf({ isActive: v.isActive, product })) === null,
    })),
  };
}
