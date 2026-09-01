import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@shop/db';
import {
  canManageProduct, merchantScope, verifyImageBytes, imageObjectKey,
  defaultAlt, resequence, ImageError, MAX_IMAGES_PER_PRODUCT,
  type Actor,
} from '@shop/core';
import { getStorage } from '~/lib/storage';
import { ProductError } from './manage-product';

/**
 * 상품 이미지 관리.
 *
 * 저장소와 DB 두 곳에 쓰는 일이라 **어긋나는 순간**을 정해 둬야 한다.
 * 여기서는 저장소 먼저, DB 나중이다. 그러면 최악의 경우 아무도 참조하지 않는
 * 객체가 남는데, 반대 순서로 하면 DB 가 없는 이미지를 가리켜 화면이 깨진다.
 * 고아 객체는 조용하고, 깨진 이미지는 고객에게 보인다.
 */

export interface ProductImageRow {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly sortOrder: number;
}

async function loadProduct(actor: Actor, productId: string) {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,
      ...(scope ? { brand: { merchantId: scope } } : {}),
    },
    select: {
      id: true, name: true,
      brand: { select: { name: true, merchantId: true } },
      _count: { select: { images: true } },
    },
  });
  if (!product) throw new ProductError('PRODUCT_NOT_FOUND', 404);
  if (!canManageProduct(actor, { merchantId: product.brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }
  return product;
}

export async function addProductImage(
  actor: Actor,
  productId: string,
  file: { bytes: Uint8Array; declaredType: string },
  alt?: string,
): Promise<ProductImageRow> {
  const product = await loadProduct(actor, productId);

  if (product._count.images >= MAX_IMAGES_PER_PRODUCT) {
    throw new ImageError('TOO_MANY_IMAGES');
  }

  // 내용에서 알아낸 형식을 쓴다. 선언값을 그대로 쓰면 검사한 의미가 없다.
  const contentType = verifyImageBytes(file);

  const key = imageObjectKey({
    productId,
    contentType,
    // 파일 이름을 쓰지 않는다 — 경로 탈출과 덮어쓰기가 전부 거기서 나온다
    token: randomBytes(12).toString('base64url'),
  });

  const { url } = await getStorage().put({ key, body: file.bytes, contentType });

  const sortOrder = product._count.images;
  const image = await prisma.productImage.create({
    data: {
      productId,
      url,
      storageKey: key,
      sortOrder,
      alt:
        alt?.trim() ||
        defaultAlt({
          brandName: product.brand.name,
          productName: product.name,
          index: sortOrder,
        }),
    },
    select: { id: true, url: true, alt: true, sortOrder: true },
  });

  return image;
}

export async function updateImageAlt(
  actor: Actor,
  productId: string,
  imageId: string,
  alt: string,
): Promise<ProductImageRow> {
  await loadProduct(actor, productId);

  const trimmed = alt.trim();
  // 빈 대체 텍스트를 허용하면 스크린리더에 아무것도 안 읽힌다.
  // 기본값이라도 넣게 하는 편이 낫다.
  if (trimmed.length === 0) throw new ImageError('ALT_REQUIRED');

  const result = await prisma.productImage.updateMany({
    // productId 를 함께 건다. 남의 상품 이미지 id 를 끼워 넣지 못하게.
    where: { id: imageId, productId },
    data: { alt: trimmed },
  });
  if (result.count === 0) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const image = await prisma.productImage.findUniqueOrThrow({
    where: { id: imageId },
    select: { id: true, url: true, alt: true, sortOrder: true },
  });
  return image;
}

export async function deleteProductImage(
  actor: Actor,
  productId: string,
  imageId: string,
): Promise<{ remaining: readonly ProductImageRow[] }> {
  await loadProduct(actor, productId);

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: { id: true, storageKey: true },
  });
  if (!image) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  await prisma.productImage.delete({ where: { id: image.id } });

  // 저장소 삭제는 실패해도 넘어간다. 화면에서 사라지는 것이 우선이고,
  // 남은 객체는 눈에 보이는 피해가 없다. 반대로 DB 만 남기면 깨진 이미지가 뜬다.
  if (image.storageKey) {
    try {
      await getStorage().remove(image.storageKey);
    } catch (error) {
      console.error('[images] 저장소 객체 삭제 실패 — 고아 객체 남음', {
        key: image.storageKey,
        error,
      });
    }
  }

  return { remaining: await resequenceImages(productId) };
}

export async function reorderProductImages(
  actor: Actor,
  productId: string,
  orderedIds: readonly string[],
): Promise<readonly ProductImageRow[]> {
  await loadProduct(actor, productId);

  const owned = await prisma.productImage.findMany({
    where: { productId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  // 개수가 같고 전부 이 상품 것이어야 한다. 일부만 보내면 나머지 순서가
  // 어떻게 되는지 정의되지 않는다.
  if (orderedIds.length !== owned.length || !orderedIds.every((id) => ownedIds.has(id))) {
    throw new ProductError('PRODUCT_NOT_FOUND', 404);
  }

  await prisma.$transaction(
    resequence(orderedIds).map(({ item, sortOrder }) =>
      prisma.productImage.update({ where: { id: item }, data: { sortOrder } }),
    ),
  );

  return listProductImages(productId);
}

/** 삭제 뒤 0,1,2… 로 다시 매긴다. 구멍이 남으면 대표 이미지 판정이 흔들린다. */
async function resequenceImages(productId: string): Promise<readonly ProductImageRow[]> {
  const rows = await prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, url: true, alt: true, sortOrder: true },
  });

  const fixes = resequence(rows).filter(({ item, sortOrder }) => item.sortOrder !== sortOrder);
  if (fixes.length > 0) {
    await prisma.$transaction(
      fixes.map(({ item, sortOrder }) =>
        prisma.productImage.update({ where: { id: item.id }, data: { sortOrder } }),
      ),
    );
  }

  return resequence(rows).map(({ item, sortOrder }) => ({ ...item, sortOrder }));
}

export async function listProductImages(productId: string): Promise<readonly ProductImageRow[]> {
  return prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, url: true, alt: true, sortOrder: true },
  });
}
