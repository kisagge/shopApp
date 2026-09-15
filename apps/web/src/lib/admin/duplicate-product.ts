import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, canManageProduct, merchantScope, copyNameOf, copySlugCandidate, copySkuCandidate,
  searchTextFor, type Actor,
} from '@shop/core';
import { ProductError, slugTaken } from './manage-product';

/**
 * 사본 주소·SKU 를 찾을 때 몇 번째 후보까지 차례로 볼지. 그래도 다 차 있으면 **시각으로 지은 번호**로 간다 — 상품을
 * 지우는 길이 없어 사본이 쌓이기만 하는데, 스무 벌째에서 복제가 영영 막히면 안 된다.
 */
const MAX_CANDIDATES = 20;
const fallbackNumber = (): number => MAX_CANDIDATES + 1 + (Date.now() % 1_000_000);

export interface DuplicatedProduct {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly sourceId: string;
  readonly variants: number;
  readonly images: number;
}

/**
 * 상품 복제.
 *
 * **틀은 가져오고 팔리는 값은 두고 온다.** 가져오는 것: 브랜드·카테고리·가격·설명, 옵션 묶음과 값, 옵션(추가금·판매
 * 여부), 사진. 두고 오는 것: 재고(0 으로), 게시 상태(임시저장), 리뷰·별점·판매량·찜·기획전·문의·옛 주소 — 사본이 원본의
 * 평판을 들고 매대에 오르면 안 된다.
 *
 * **사진은 파일을 새로 올리지 않고 같은 파일을 가리킨다.** 대신 한쪽에서 사진을 지울 때 다른 상품이 같은 파일을 쓰면
 * 저장소 파일은 남긴다(manage-images 의 deleteProductImage) — 원본에서 지웠더니 사본 사진이 깨지면 안 된다.
 *
 * 가맹점은 자기 브랜드 상품만 복제한다. 남의 상품은 없는 상품으로 답한다(조회 범위).
 */
export async function duplicateProduct(actor: Actor, productId: string): Promise<DuplicatedProduct> {
  assertPermission(actor, 'product:write');
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const source = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null, ...(scope ? { brand: { merchantId: scope } } : {}) },
    select: {
      id: true, slug: true, name: true, description: true, brandId: true, categoryId: true,
      listPrice: true, salePrice: true, sellingPrice: true,
      brand: { select: { name: true, merchantId: true } },
      optionGroups: {
        orderBy: { sortOrder: 'asc' },
        select: { id: true, name: true, sortOrder: true, values: { select: { id: true, value: true, swatchHex: true, sortOrder: true } } },
      },
      variants: {
        orderBy: { createdAt: 'asc' },
        select: { sku: true, label: true, priceOverride: true, isActive: true, optionValues: { select: { id: true } } },
      },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { url: true, alt: true, sortOrder: true, blurDataUrl: true, storageKey: true, credit: true, creditUrl: true },
      },
    },
  });
  if (!source || !canManageProduct(actor, { merchantId: source.brand.merchantId })) {
    throw new ProductError('PRODUCT_NOT_FOUND', 404);
  }

  const slug = await firstFreeSlug(source.slug);
  const skus = await freeSkus(source.variants.map((v) => v.sku));
  const name = copyNameOf(source.name);

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        slug, name, description: source.description,
        brandId: source.brandId, categoryId: source.categoryId,
        listPrice: source.listPrice, salePrice: source.salePrice, sellingPrice: source.sellingPrice,
        searchText: searchTextFor({ name, brandName: source.brand.name }),
        status: 'DRAFT',
      },
      select: { id: true },
    });

    // 옛 값 id → 새 값 id. 옵션이 어느 값들의 조합인지 새 값으로 다시 잇는다
    const valueIds = new Map<string, string>();
    for (const group of source.optionGroups) {
      const made = await tx.productOptionGroup.create({
        data: {
          productId: product.id, name: group.name, sortOrder: group.sortOrder,
          values: { create: group.values.map((v) => ({ value: v.value, swatchHex: v.swatchHex, sortOrder: v.sortOrder })) },
        },
        select: { values: { select: { id: true, value: true } } },
      });
      for (const v of group.values) {
        const twin = made.values.find((m) => m.value === v.value);
        if (twin) valueIds.set(v.id, twin.id);
      }
    }

    for (const [i, variant] of source.variants.entries()) {
      await tx.productVariant.create({
        data: {
          productId: product.id,
          sku: skus[i]!,
          label: variant.label,
          priceOverride: variant.priceOverride,
          isActive: variant.isActive,
          // 재고는 가져오지 않는다 — 원본 창고의 수량이 사본의 수량일 리 없다
          stock: 0,
          optionValues: { connect: variant.optionValues.flatMap((v) => (valueIds.has(v.id) ? [{ id: valueIds.get(v.id)! }] : [])) },
        },
      });
    }

    if (source.images.length > 0) {
      await tx.productImage.createMany({
        data: source.images.map((img) => ({ ...img, productId: product.id })),
      });
    }
    return product;
  });

  return {
    id: created.id, slug, name, sourceId: source.id,
    variants: source.variants.length, images: source.images.length,
  };
}

async function firstFreeSlug(slug: string): Promise<string> {
  for (let n = 1; n <= MAX_CANDIDATES; n += 1) {
    const candidate = copySlugCandidate(slug, n);
    if (!(await slugTaken(candidate))) return candidate;
  }
  const last = copySlugCandidate(slug, fallbackNumber());
  if (await slugTaken(last)) throw new ProductError('SLUG_TAKEN', 409);
  return last;
}

/** 옵션마다 비어 있는 첫 사본 SKU. 한 번에 후보를 모아 묻는다 — 옵션 수만큼 왕복하지 않게 */
async function freeSkus(skus: readonly string[]): Promise<string[]> {
  const candidates = skus.flatMap((sku) => Array.from({ length: MAX_CANDIDATES }, (_, i) => copySkuCandidate(sku, i + 1)));
  const taken = new Set(
    (await prisma.productVariant.findMany({ where: { sku: { in: candidates } }, select: { sku: true } })).map((v) => v.sku),
  );
  const chosen = new Set<string>();
  return skus.map((sku) => {
    for (let n = 1; n <= MAX_CANDIDATES; n += 1) {
      const candidate = copySkuCandidate(sku, n);
      if (!taken.has(candidate) && !chosen.has(candidate)) {
        chosen.add(candidate);
        return candidate;
      }
    }
    // 겹치면 저장이 유일 제약에서 막힌다 — 조용히 틀린 SKU 가 들어가지는 않는다
    const last = copySkuCandidate(sku, fallbackNumber() + chosen.size);
    chosen.add(last);
    return last;
  });
}
