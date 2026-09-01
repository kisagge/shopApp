import 'server-only';
import { prisma } from '@shop/db';
import { canManageProduct, merchantScope, type Actor } from '@shop/core';
import {
  PRODUCT_ERROR_MESSAGE,
  type CreateProductInput, type UpdateProductInput, type UpdateStockInput,
  type ProductErrorCode,
} from '@shop/contract';

/**
 * 가격 세 값을 한 번에 만든다.
 *
 * sellingPrice 는 salePrice ?? listPrice 인 파생값인데, 정렬과 범위 필터
 * 때문에 컬럼으로 저장한다. **가격을 바꾸는 모든 경로가 이 함수를 거쳐야**
 * 값이 어긋나지 않는다. 따로 계산해 쓰지 말 것.
 */
export function priceFields(input: { listPrice: number; salePrice: number | null }) {
  return {
    listPrice: input.listPrice,
    salePrice: input.salePrice,
    sellingPrice: input.salePrice ?? input.listPrice,
  };
}

/**
 * 검색 대상 문자열.
 *
 * 브랜드명을 상품 행에 복사해 둔다 — 검색 OR 가 두 테이블에 걸치면
 * 인덱스를 못 쓴다. 소문자로 저장해 비교 때 대소문자를 신경 쓰지 않는다.
 */
export function searchTextFor(input: { name: string; brandName: string }): string {
  return `${input.name} ${input.brandName}`.toLowerCase();
}

export class ProductError extends Error {
  constructor(readonly code: ProductErrorCode, readonly status = 409) {
    super(PRODUCT_ERROR_MESSAGE[code]);
    this.name = 'ProductError';
  }
}

/**
 * 이 브랜드에 상품을 등록·수정할 수 있는가.
 *
 * **권한만 보면 안 된다.** 가맹점은 product:write 를 갖고 있지만 남의 브랜드는
 * 건드릴 수 없다. core 의 canManageProduct 가 두 층을 함께 본다.
 */
async function assertBrandAllowed(actor: Actor, brandId: string): Promise<{ name: string }> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    // 이름도 함께 가져온다 — searchText 를 만들 때 필요하다
    select: { merchantId: true, name: true },
  });
  if (!brand) throw new ProductError('BRAND_NOT_ALLOWED', 403);
  if (!canManageProduct(actor, { merchantId: brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }
  return { name: brand.name };
}

export async function createProduct(actor: Actor, input: CreateProductInput) {
  const brand = await assertBrandAllowed(actor, input.brandId);

  const category = await prisma.category.findUnique({
    where: { id: input.categoryId }, select: { id: true },
  });
  if (!category) throw new ProductError('CATEGORY_NOT_FOUND', 400);

  const taken = await prisma.product.findUnique({
    where: { slug: input.slug }, select: { id: true },
  });
  if (taken) throw new ProductError('SLUG_TAKEN', 409);

  return prisma.product.create({
    data: {
      slug: input.slug,
      name: input.name,
      description: input.description,
      brandId: input.brandId,
      categoryId: input.categoryId,
      ...priceFields(input),
      searchText: searchTextFor({ name: input.name, brandName: brand.name }),
      status: input.status,
      // 공개 상태로 만들 때만 게시 시각을 찍는다. 이 값이 없으면 스토어프론트
      // 조회에서 걸러진다.
      publishedAt: input.status === 'DRAFT' ? null : new Date(),
    },
    select: { id: true, slug: true, name: true, status: true },
  });
}

/** 감사 로그에 남길 변경 전 상태 */
export async function loadProductForAudit(actor: Actor, productId: string) {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      deletedAt: null,
      ...(scope ? { brand: { merchantId: scope } } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, status: true,
      brandId: true, categoryId: true, publishedAt: true,
      brand: { select: { merchantId: true } },
    },
  });
  if (!product) throw new ProductError('PRODUCT_NOT_FOUND', 404);
  return product;
}

export async function updateProduct(
  actor: Actor,
  productId: string,
  input: UpdateProductInput,
) {
  const before = await loadProductForAudit(actor, productId);

  if (!canManageProduct(actor, { merchantId: before.brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }
  // 브랜드를 옮기는 경우 **옮겨 갈 브랜드도** 확인해야 한다.
  // 그러지 않으면 자기 브랜드 상품을 남의 브랜드로 밀어 넣을 수 있다.
  let brandName: string | null = null;
  if (input.brandId && input.brandId !== before.brandId) {
    brandName = (await assertBrandAllowed(actor, input.brandId)).name;
  }

  // 이름이나 브랜드가 바뀌면 검색 문자열을 다시 만든다.
  // 바뀌지 않은 쪽은 지금 값을 그대로 읽어 와야 한다.
  const nameChanged = input.name !== undefined && input.name !== before.name;
  const brandChanged = brandName !== null;
  if (nameChanged || brandChanged) {
    brandName ??= (
      await prisma.brand.findUniqueOrThrow({
        where: { id: before.brandId },
        select: { name: true },
      })
    ).name;
  }

  if (input.slug && input.slug !== before.slug) {
    const taken = await prisma.product.findUnique({
      where: { slug: input.slug }, select: { id: true },
    });
    if (taken) throw new ProductError('SLUG_TAKEN', 409);
  }

  const goingPublic = input.status !== undefined && input.status !== 'DRAFT';

  const after = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.brandId !== undefined ? { brandId: input.brandId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      // 둘 중 하나만 바뀌어도 판매가가 달라지므로 셋을 함께 다시 쓴다.
      // 보내지 않은 쪽은 기존 값을 그대로 쓴다.
      ...(input.listPrice !== undefined || input.salePrice !== undefined
        ? priceFields({
            listPrice: input.listPrice ?? before.listPrice,
            salePrice: input.salePrice !== undefined ? input.salePrice : before.salePrice,
          })
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(nameChanged || brandChanged
        ? { searchText: searchTextFor({ name: input.name ?? before.name, brandName: brandName! }) }
        : {}),
      // 처음 공개할 때만 게시 시각을 찍는다. 다시 공개할 때 덮어쓰면
      // "신상품" 판정이 되살아난다.
      ...(goingPublic && before.publishedAt === null ? { publishedAt: new Date() } : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, status: true, brandId: true, categoryId: true,
    },
  });

  return { before, after };
}

/**
 * 재고 조정.
 *
 * 주문의 재고 차감과 달리 여기서는 **덮어쓴다** — 실사 결과를 반영하는
 * 동작이라 증감이 아니라 절대값이 맞다. 다만 그 사이 팔린 수량은 반영되지
 * 않으므로, 어드민 화면은 저장 직후 값을 다시 읽어 보여 준다.
 */
export async function updateStock(actor: Actor, productId: string, input: UpdateStockInput) {
  const before = await loadProductForAudit(actor, productId);
  if (!canManageProduct(actor, { merchantId: before.brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }

  const ids = input.variants.map((v) => v.variantId);
  const owned = await prisma.productVariant.findMany({
    where: { id: { in: ids }, productId },
    select: { id: true, sku: true, stock: true },
  });
  // 남의 상품 변형 id 를 끼워 넣어 재고를 조작할 수 없게 한다
  if (owned.length !== ids.length) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  await prisma.$transaction(
    input.variants.map((v) =>
      prisma.productVariant.update({
        where: { id: v.variantId },
        data: { stock: v.stock, ...(v.isActive === undefined ? {} : { isActive: v.isActive }) },
      }),
    ),
  );

  return {
    before: owned.map((o) => ({ sku: o.sku, stock: o.stock })),
    after: input.variants.map((v) => ({
      sku: owned.find((o) => o.id === v.variantId)?.sku ?? v.variantId,
      stock: v.stock,
    })),
  };
}

/** 상품 등록 폼이 쓰는 선택지. 가맹점에게는 자기 브랜드만 준다. */
export async function getProductFormOptions(actor: Actor) {
  const scope = merchantScope(actor);
  if (scope === undefined) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  const [brands, categories] = await Promise.all([
    prisma.brand.findMany({
      where: scope ? { merchantId: scope } : {},
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.category.findMany({
      // 상품은 말단 카테고리에만 붙인다. 상위에 붙이면 목록 필터가 어긋난다.
      where: { children: { none: {} } },
      orderBy: { slug: 'asc' },
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
  ]);

  return {
    brands,
    categories: categories.map((c) => ({
      id: c.id,
      label: c.parent ? `${c.parent.name} > ${c.name}` : c.name,
    })),
  };
}

/** 옵션 추가. 옵션이 없는 상품은 장바구니에 담을 수 없으므로 등록 직후 필요하다. */
export async function createVariant(
  actor: Actor,
  productId: string,
  input: { sku: string; optionLabel: string; stock: number },
) {
  const product = await loadProductForAudit(actor, productId);
  if (!canManageProduct(actor, { merchantId: product.brand.merchantId })) {
    throw new ProductError('BRAND_NOT_ALLOWED', 403);
  }

  const taken = await prisma.productVariant.findUnique({
    where: { sku: input.sku }, select: { id: true },
  });
  if (taken) throw new ProductError('SKU_TAKEN', 409);

  return prisma.productVariant.create({
    data: {
      productId,
      sku: input.sku,
      label: input.optionLabel,
      stock: input.stock,
    },
    select: { id: true, sku: true, label: true, stock: true },
  });
}
