import 'server-only';
import { prisma } from '@shop/db';
import {
  canManageProduct, merchantScope, becameAvailable, hasPermission,
  needsPublishPermission, isVisibleStatus, PUBLISH_PERMISSION,
  type Actor, type ProductStatus,
  searchTextFor, sellingPriceOf, isSlugTaken,
} from '@shop/core';
import { notifyRestocked } from '~/lib/restock/notify';
import { recordAudit } from '~/lib/audit';
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
/**
 * 이 주소를 쓸 수 있는가.
 *
 * **지금 쓰는 주소만 보면 모자란다.** 남이 버리고 간 주소를 새로 집어 가면
 * 그 주소가 한쪽에서는 새 주인을 가리키고 다른 쪽에서는 옛 주인으로 넘긴다.
 * 만들 때와 고칠 때가 같은 규칙을 쓰도록 한 곳에 둔다.
 */
async function slugTaken(slug: string, selfId?: string): Promise<boolean> {
  const [live, history] = await Promise.all([
    prisma.product.findUnique({ where: { slug }, select: { id: true } }),
    prisma.productSlug.findUnique({ where: { slug }, select: { productId: true } }),
  ]);
  return isSlugTaken({
    liveOwnerId: live?.id ?? null,
    historyOwnerId: history?.productId ?? null,
    selfId,
  });
}

function priceFields(input: { listPrice: number; salePrice: number | null }) {
  return {
    listPrice: input.listPrice,
    salePrice: input.salePrice,
    // 파생 규칙은 core 에 있다 — 시드도 같은 것을 쓴다
    sellingPrice: sellingPriceOf(input),
  };
}

// 검색 대상 문자열을 만드는 규칙은 core 에 있다 — 시드도 같은 것을 쓴다
export { searchTextFor };

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

/**
 * 매대에 올릴 수 있는 사람인가.
 *
 * `product:publish` 는 권한 표에만 있고 **어디서도 검사하지 않았다.**
 * 그래서 상품을 쓸 수 있는 사람은 누구나 그대로 매대에 올릴 수 있었다.
 *
 * 판단은 core 가 한다 — 무엇이 "게시" 인지(어떤 상태가 매대에 보이는지)는
 * 정책이고, 여기서 다시 적으면 스토어프론트 조회와 어긋난다.
 */
function assertCanPublish(
  actor: Actor,
  to: ProductStatus | undefined,
  publishedAt: Date | null,
): void {
  if (to === undefined) return;
  if (!needsPublishPermission({ to, publishedAt })) return;
  if (!hasPermission(actor, PUBLISH_PERMISSION)) {
    throw new ProductError('PUBLISH_NOT_ALLOWED', 403);
  }
}

export async function createProduct(actor: Actor, input: CreateProductInput) {
  const brand = await assertBrandAllowed(actor, input.brandId);

  const category = await prisma.category.findUnique({
    where: { id: input.categoryId }, select: { id: true },
  });
  if (!category) throw new ProductError('CATEGORY_NOT_FOUND', 400);

  if (await slugTaken(input.slug)) throw new ProductError('SLUG_TAKEN', 409);

  // 새 상품은 게시된 적이 없다. 곧바로 매대 상태로 만들려면 권한이 필요하다.
  assertCanPublish(actor, input.status, null);

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
      /*
       * 게시 시각은 **매대에 보이는 상태일 때만** 찍는다.
       *
       * "DRAFT 가 아니면" 으로 두면 HIDDEN 이나 검수 대기에도 찍힌다. 그건
       * 원래도 어긋난 값이었지만, 이제는 구멍이 된다 — publishedAt 이 있으면
       * 검수를 통과한 상품으로 보므로, 가맹점이 검수 대기로 한 번 저장한 뒤
       * 스스로 판매중으로 올릴 수 있게 된다.
       */
      publishedAt: isVisibleStatus(input.status) ? new Date() : null,
      // 검수를 요청한 시각. 대기줄을 오래된 순으로 꺼내는 데 쓴다.
      reviewRequestedAt: input.status === 'PENDING_REVIEW' ? new Date() : null,
    },
    select: { id: true, slug: true, name: true, status: true },
  });
}

/** 감사 로그에 남길 변경 전 상태 */
async function loadProductForAudit(actor: Actor, productId: string) {
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

  const renaming = Boolean(input.slug) && input.slug !== before.slug;
  if (renaming && (await slugTaken(input.slug!, productId))) {
    throw new ProductError('SLUG_TAKEN', 409);
  }

  assertCanPublish(actor, input.status, before.publishedAt);

  // 같은 이유로 여기서도 "DRAFT 가 아니면" 이 아니라 "매대에 보이면" 이다
  const goingPublic = input.status !== undefined && isVisibleStatus(input.status);

  /*
   * **옛 주소를 기록하는 것과 이름을 바꾸는 것은 함께 일어나야 한다.**
   *
   * 따로 두면 하나만 성공했을 때 링크가 죽거나(기록 실패), 살아 있는 주소가
   * 옛 주소로 기록된다(수정 실패). 둘 다 조용한 고장이라 트랜잭션으로 묶는다.
   *
   * 되돌아온 주소는 기록에서 지운다 — a → b → a 로 돌아왔으면 a 는 이제 지금
   * 주소이고, 기록에 남겨 두면 자기 자신으로 넘기는 고리가 된다.
   */
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
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
      /*
       * 검수를 다시 요청하면 시각을 새로 찍고 **지난 반려 사유를 지운다.**
       * 남겨 두면 고쳐서 다시 올린 상품에 옛 반려 사유가 붙어 있어, 가맹점도
       * 운영진도 지금 상태인 줄 안다.
       */
      ...(input.status === 'PENDING_REVIEW'
        ? { reviewRequestedAt: new Date(), publishRejection: null }
        : {}),
    },
    select: {
      id: true, slug: true, name: true, description: true,
      listPrice: true, salePrice: true, status: true, brandId: true, categoryId: true,
    },
    });

    if (renaming) {
      await tx.productSlug.upsert({
        where: { slug: before.slug },
        create: { slug: before.slug, productId },
        update: { productId },
      });
      await tx.productSlug.deleteMany({ where: { slug: input.slug! } });
    }

    return updated;
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

  /**
   * 재입고 알림.
   *
   * **없다가 생긴 것만** 고른다. "재고가 0보다 크다" 로 판단하면 10에서
   * 8로 줄이는 평범한 수정에도 알림이 나간다.
   *
   * 트랜잭션 밖에서 부르고 실패해도 삼킨다. 재고는 팔기 위한 값이고
   * 알림은 곁다리다 — 알림이 안 나갔다고 재고 수정이 되돌아가면 안 된다.
   */
  const restocked = input.variants
    .filter((v) => {
      const was = owned.find((o) => o.id === v.variantId);
      return was !== undefined && becameAvailable(was.stock, v.stock);
    })
    .map((v) => v.variantId);

  if (restocked.length > 0) {
    try {
      await notifyRestocked(restocked);
    } catch (error) {
      console.error('[restock] 알림 실패', { variantIds: restocked }, error);
    }
  }

  return {
    before: owned.map((o) => ({ sku: o.sku, stock: o.stock })),
    after: input.variants.map((v) => ({
      sku: owned.find((o) => o.id === v.variantId)?.sku ?? v.variantId,
      stock: v.stock,
    })),
  };
}

/**
 * 재고 수정 + 감사 로그.
 *
 * **상품 화면의 재고 수정과 일괄 수정이 이것 하나를 쓴다.** 감사 로그를 창구에서 남기면 일괄 창구를
 * 만들 때 그 줄을 옮겨 적어야 하고, 빠뜨리면 수백 개 옵션의 재고가 **누가 바꿨는지 모르게** 바뀐다.
 * 송장 일괄 등록이 registerShipmentAudited 를 쓰는 것과 같은 이유다.
 */
export async function updateStockAudited(
  actor: Actor,
  productId: string,
  input: UpdateStockInput,
  request: Request,
) {
  const result = await updateStock(actor, productId, input);
  await recordAudit({
    actor,
    action: 'product.stock',
    targetType: 'product',
    targetId: productId,
    before: { variants: result.before },
    after: { variants: result.after },
    request,
  });
  return result;
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

/**
 * 게시 검수 처리.
 *
 * 운영진이 대기줄의 상품을 매대에 올리거나 되돌린다. 상태를 그냥 고치는
 * 것과 나눠 둔 이유는 **되돌릴 때 사유가 필요하기 때문**이다 — 이유 없이
 * DRAFT 로 내려보내면 가맹점은 무엇을 고쳐야 할지 알 수 없고, 그대로 다시
 * 올려서 같은 일이 반복된다.
 */
export async function reviewProduct(
  actor: Actor,
  productId: string,
  input: { approve: boolean; reason?: string | null },
) {
  if (!hasPermission(actor, PUBLISH_PERMISSION)) {
    throw new ProductError('PUBLISH_NOT_ALLOWED', 403);
  }

  const before = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, name: true, status: true, publishedAt: true },
  });
  if (!before) throw new ProductError('PRODUCT_NOT_FOUND', 404);

  // 대기줄에 없는 상품을 처리하면 다른 운영자가 이미 본 것을 두 번 처리한다
  if (before.status !== 'PENDING_REVIEW') throw new ProductError('NOT_AWAITING_REVIEW', 409);

  const reason = input.reason?.trim() ?? '';
  if (!input.approve && reason.length === 0) {
    throw new ProductError('REJECT_REASON_REQUIRED', 400);
  }

  const after = await prisma.product.update({
    where: { id: productId },
    data: input.approve
      ? {
          status: 'ACTIVE',
          reviewRequestedAt: null,
          publishRejection: null,
          // 최초 게시에만 찍는다. 두 번째부터는 검수를 다시 받지 않는다.
          ...(before.publishedAt === null ? { publishedAt: new Date() } : {}),
        }
      : { status: 'DRAFT', reviewRequestedAt: null, publishRejection: reason },
    select: { id: true, name: true, status: true, publishRejection: true },
  });

  return { before, after };
}
