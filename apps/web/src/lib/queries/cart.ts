import 'server-only';
import { prisma } from '@shop/db';
import {
  calculateCart, discountRateOf, won, ZERO,
  type CartLine, type Coupon, type Won,
} from '@shop/core';
import {
  type CartQuoteRequest, type CartQuoteResponse, type CartQuoteLine, type LineIssue,
} from '@shop/contract';

/**
 * 장바구니 견적.
 *
 * **가격·재고·쿠폰은 전부 여기서 DB 를 보고 정한다.** 클라이언트는 무엇을 몇 개
 * 담았는지만 말한다. 담아 둔 사이에 값이 오르거나 품절될 수 있어서, 줄마다
 * 무슨 일이 있었는지(issue)를 함께 돌려준다.
 */
export async function quoteCart(
  input: CartQuoteRequest,
  viewer: { id: string; pointBalance: number } | null,
): Promise<CartQuoteResponse> {
  const requested = new Map(input.lines.map((l) => [l.variantId, l.quantity]));

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...requested.keys()] } },
    select: {
      id: true, label: true, stock: true, isActive: true, priceOverride: true,
      product: {
        select: {
          slug: true, name: true, listPrice: true, salePrice: true,
          status: true, deletedAt: true,
          // 가맹점이 정지되면 그 상품은 팔 수 없다. 상품 상태만 보면
          // 정지 처분이 판매를 멈추지 못한다.
          brand: { select: { name: true, merchant: { select: { status: true } } } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: CartQuoteLine[] = input.lines.map((l) => {
    const v = byId.get(l.variantId);

    // 상품이 사라졌거나 내려갔다
    if (!v || v.product.deletedAt !== null || v.product.status === 'DRAFT') {
      return emptyLine(l.variantId, l.quantity, 'NOT_FOUND');
    }
    if (
      !v.isActive ||
      v.product.status === 'HIDDEN' ||
      // 자사 직매입 브랜드는 가맹점이 없다 — 그때는 막지 않는다
      (v.product.brand.merchant?.status ?? 'APPROVED') !== 'APPROVED'
    ) {
      return emptyLine(l.variantId, l.quantity, 'INACTIVE', v.product.name, v.label);
    }

    const listPrice = won(v.product.listPrice);
    const base = v.product.salePrice === null ? listPrice : won(v.product.salePrice);
    const unitPrice = v.priceOverride === null ? base : won(v.priceOverride);

    // 재고보다 많이 담겨 있으면 재고만큼만 계산한다. 조용히 실패시키지 않고 알린다.
    const quantity = Math.min(l.quantity, Math.max(0, v.stock));
    const issue: LineIssue | null =
      quantity === 0 ? 'SOLD_OUT' : quantity < l.quantity ? 'STOCK_REDUCED' : null;

    return {
      variantId: v.id,
      productSlug: v.product.slug,
      productName: v.product.name,
      brandName: v.product.brand.name,
      optionLabel: v.label,
      listPrice,
      unitPrice,
      discountPercent: discountRateOf(listPrice, unitPrice),
      quantity,
      requestedQuantity: l.quantity,
      subtotal: won(unitPrice * quantity),
      stock: v.stock,
      issue,
    };
  });

  // 실제로 살 수 있는 줄만 금액 계산에 넣는다
  const payableLines: CartLine[] = lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      variantId: l.variantId,
      productName: l.productName,
      listPrice: won(l.listPrice),
      salePrice: won(l.unitPrice),
      quantity: l.quantity,
    }));

  const merchandiseSoFar = won(payableLines.reduce((sum, l) => sum + l.salePrice * l.quantity, 0));
  const resolved = await resolveCoupon(input.couponCode, viewer?.id ?? null, merchandiseSoFar);

  const pointsAvailable = won(viewer?.pointBalance ?? 0);

  if (payableLines.length === 0) {
    return {
      lines,
      listTotal: ZERO, productDiscount: ZERO, merchandiseTotal: ZERO,
      couponDiscount: ZERO, couponName: null,
      pointsUsed: ZERO, pointsAvailable,
      shippingFee: ZERO, isFreeShipping: false, remainingForFreeShipping: ZERO,
      payable: ZERO, rewardPoints: ZERO,
    };
  }

  const totals = calculateCart({
    lines: payableLines,
    coupon: resolved?.coupon,
    pointsToUse: input.pointsToUse === undefined ? undefined : won(input.pointsToUse),
    // 보유 포인트는 세션이 말하는 값만 믿는다
    pointsAvailable,
    isRemoteArea: input.isRemoteArea,
  });

  return {
    lines,
    listTotal: totals.listTotal,
    productDiscount: totals.productDiscount,
    merchandiseTotal: totals.merchandiseTotal,
    couponDiscount: totals.couponDiscount,
    couponName: totals.couponDiscount > 0 ? (resolved?.name ?? null) : null,
    pointsUsed: totals.pointsUsed,
    pointsAvailable,
    shippingFee: totals.shipping.fee,
    isFreeShipping: totals.shipping.isFree,
    remainingForFreeShipping: totals.shipping.remainingForFree,
    payable: totals.payable,
    rewardPoints: totals.rewardPoints,
  };
}

function emptyLine(
  variantId: string, requestedQuantity: number, issue: LineIssue,
  productName = '삭제된 상품', optionLabel = '-',
): CartQuoteLine {
  return {
    variantId, productSlug: '', productName, brandName: '-', optionLabel,
    listPrice: ZERO, unitPrice: ZERO, discountPercent: 0,
    quantity: 0, requestedQuantity, subtotal: ZERO, stock: 0, issue,
  };
}

/**
 * 쿠폰은 코드만으로 적용하지 않는다.
 * 로그인한 사용자가 **발급받아 아직 쓰지 않은** 쿠폰이어야 한다.
 * 코드만 알면 누구나 쓸 수 있으면 쿠폰 정책이 의미가 없다.
 */
async function resolveCoupon(
  code: string | undefined,
  userId: string | null,
  merchandiseTotal: Won,
): Promise<{ coupon: Coupon; name: string } | null> {
  if (!code || !userId) return null;

  const now = new Date();
  const issued = await prisma.userCoupon.findFirst({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: now },
      coupon: { code, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    },
    select: { coupon: true },
  });
  if (!issued) return null;

  const c = issued.coupon;
  if (merchandiseTotal < c.minimumOrder) return null;

  const coupon: Coupon =
    c.kind === 'AMOUNT'
      ? { kind: 'amount', code: c.code, value: won(c.value), minimumOrder: won(c.minimumOrder) }
      : {
          kind: 'percent', code: c.code, percent: c.percent,
          maxDiscount: c.maxDiscount === null ? null : won(c.maxDiscount),
          minimumOrder: won(c.minimumOrder),
        };
  return { coupon, name: c.name };
}
