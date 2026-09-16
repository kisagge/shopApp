import 'server-only';
import { prisma } from '@shop/db';
import {
  calculateCart, discountRateOf, won, ZERO, variantUnavailable, type VariantState, type ProductStatus,
  type CartLine, type Coupon, type LineShare, type ShippingPolicy,
  couponOffers, bestCoupon,
} from '@shop/core';
import {
  type CartQuoteRequest, type CartQuoteResponse, type CartQuoteLine, type LineIssue,
} from '@shop/contract';
import { getShippingPolicy } from '~/lib/shipping-policy';

/**
 * 장바구니 견적.
 *
 * **가격·재고·쿠폰은 전부 여기서 DB 를 보고 정한다.** 클라이언트는 무엇을 몇 개
 * 담았는지만 말한다. 담아 둔 사이에 값이 오르거나 품절될 수 있어서, 줄마다
 * 무슨 일이 있었는지(issue)를 함께 돌려준다.
 */
/**
 * 계약의 요청 모양에서 `useCoupon` 만 선택으로 둔다.
 *
 * 계약에는 기본값이 있어서(`.default(true)`) 바깥에서 오는 값은 늘 채워져
 * 있지만, 서버 안에서 부르는 자리(주문 생성·검사)는 그것까지 적을 이유가 없다.
 */
type QuoteInput = Omit<CartQuoteRequest, 'useCoupon'> & { readonly useCoupon?: boolean };

export async function quoteCart(
  input: QuoteInput,
  viewer: { id: string; pointBalance: number; rewardPercent?: number } | null,
): Promise<CartQuoteResponse> {
  return (await quoteCartDetailed(input, viewer)).quote;
}

/**
 * 견적과 함께, **화면에는 안 내려가는** 주문용 값을 준다.
 *
 * - `allocations`: 살 수 있는 줄(수량 > 0)마다 나눈 쿠폰·포인트·적립. 주문이 줄에 박는다.
 * - `shippingPolicy`: 이 견적을 계산한 배송비 정책. 주문이 스냅샷으로 남긴다.
 *
 * 응답에 얹지 않는 이유 — 브라우저가 알 필요가 없고, 견적 응답 모양이 계약이다.
 */
export async function quoteCartDetailed(
  input: QuoteInput,
  /**
   * 보는 사람. **적립률을 함께 받는다.**
   *
   * 등급별 적립률이 화면에만 있고 계산에는 붙지 않아서, 마이페이지가
   * &ldquo;적립률 3%&rdquo; 라고 적어 둔 회원에게 실제로는 1% 만 쌓였다.
   * 여기서 받아 계산에 넘긴다 — 값은 getQuoteViewer 가 낸다.
   *
   * 비회원은 null 이고, 그때는 기본 적립률이 적용된다.
   */
  viewer: { id: string; pointBalance: number; rewardPercent?: number } | null,
): Promise<{
  quote: CartQuoteResponse;
  allocations: readonly LineShare[];
  shippingPolicy: ShippingPolicy;
}> {
  const requested = new Map(input.lines.map((l) => [l.variantId, l.quantity]));

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...requested.keys()] } },
    select: {
      id: true, label: true, stock: true, isActive: true, priceOverride: true,
      product: {
        select: {
          id: true, slug: true, name: true, listPrice: true, salePrice: true,
          status: true, deletedAt: true,
          // 대상이 정해진 쿠폰의 판정에 쓴다
          brandId: true, categoryId: true,
          // 가맹점이 정지되면 그 상품은 팔 수 없다. 상품 상태만 보면
          // 정지 처분이 판매를 멈추지 못한다.
          brand: { select: { name: true, merchant: { select: { status: true } } } },
          // 담은 것이 무엇인지 눈으로 확인할 수 있게. 첫 장이면 된다.
          images: {
            select: { url: true, alt: true, blurDataUrl: true },
            orderBy: { sortOrder: 'asc' },
            take: 1,
          },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  const lines: CartQuoteLine[] = input.lines.map((l) => {
    const v = byId.get(l.variantId);

    // 담을 수 없는 줄 — 판단은 옵션 바꾸기·다시 담기와 한 벌이다(core 의 variantUnavailable)
    const unavailable = variantUnavailable(v ? variantStateOf(v) : null);
    if (!v || unavailable === 'NOT_FOUND') {
      return emptyLine(l.variantId, l.quantity, 'NOT_FOUND');
    }
    if (unavailable === 'INACTIVE') {
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
      imageUrl: v.product.images[0]?.url ?? null,
      imageAlt: v.product.images[0]?.alt ?? null,
      blurDataUrl: v.product.images[0]?.blurDataUrl ?? null,
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
      /**
       * 쿠폰 대상 판정에 쓰는 id 들.
       *
       * 화면에 내려가는 줄(lines)에는 얹지 않는다 — 응답 모양을 바꾸지
       * 않으려는 것도 있고, 브라우저가 알 필요도 없는 값이다.
       * 계산에 넘기는 줄에만 붙인다.
       */
      ...(byId.get(l.variantId)
        ? {
            productId: byId.get(l.variantId)!.product.id,
            brandId: byId.get(l.variantId)!.product.brandId,
            categoryId: byId.get(l.variantId)!.product.categoryId,
          }
        : {}),
    }));

  /**
   * 최소 주문 금액을 여기서 미리 재지 않는다.
   *
   * 대상이 정해진 쿠폰은 **그 줄들의 합계**로 재야 하는데 여기는 장바구니
   * 전체밖에 모른다. 전체로 재면 대상 아닌 상품으로 기준을 채울 수 있다.
   * 판정은 calculateCart 안에서 올바른 기준으로 한 번만 한다.
   */
  const [asked, mine] = await Promise.all([
    resolveCoupon(input.couponCode, viewer?.id ?? null),
    usableCoupons(viewer?.id ?? null),
  ]);

  const pointsAvailable = won(viewer?.pointBalance ?? 0);

  const shippingPolicy = await getShippingPolicy();

  if (payableLines.length === 0) {
    return { allocations: [], shippingPolicy, quote: {
      lines,
      listTotal: ZERO, productDiscount: ZERO, merchandiseTotal: ZERO,
      couponDiscount: ZERO, couponName: null, couponCode: null,
      // 담긴 것이 없으면 어느 쿠폰도 쓸 수 없다. 0 원짜리 목록을 보여 주지 않는다.
      coupons: [],
      pointsUsed: ZERO, pointsAvailable,
      shippingFee: ZERO, isFreeShipping: false, remainingForFreeShipping: ZERO,
      payable: ZERO, rewardPoints: ZERO,
    } };
  }

  /*
   * **고른 것이 없으면 서버가 가장 많이 깎이는 것을 붙인다.**
   *
   * 쿠폰을 받을 수는 있는데 쓸 수가 없었다 — 코드를 보내는 화면이 없었기
   * 때문이다. 그렇다고 코드를 외워 넣게 하는 것은 답이 아니다. 정률은 상한이,
   * 정액은 최소 주문 금액이, 어떤 것은 대상 상품이 걸려서 어느 것이 유리한지는
   * 하나씩 넣어 봐야 알 수 있다. 그 계산은 여기서 한다.
   *
   * 사람이 "쓰지 않기" 를 고르면 `useCoupon: false` 로 온다 — 코드를 비워
   * 보내는 것만으로는 "아직 안 골랐다" 와 구분되지 않는다.
   */
  const auto =
    input.useCoupon !== false && asked === null
      ? bestCoupon(
          mine.map((m) => ({ coupon: m.coupon, expiresAt: m.expiresAt, ref: m })),
          payableLines,
        )
      : null;
  /*
   * **붙일지 말지를 한 곳에서 정한다.** 쓰지 않겠다고 했으면 코드를 함께
   * 보냈더라도 붙이지 않는다 — 두 값이 어긋나게 오면 사람이 마지막으로 누른
   * 것을 따르는 편이 맞고, 그것이 "쓰지 않기" 다.
   */
  const resolved =
    input.useCoupon === false
      ? null
      : (asked ?? (auto === null ? null : { coupon: auto.coupon, name: auto.ref.name }));

  const totals = calculateCart({
    lines: payableLines,
    coupon: resolved?.coupon,
    pointsToUse: input.pointsToUse === undefined ? undefined : won(input.pointsToUse),
    // 보유 포인트는 세션이 말하는 값만 믿는다
    pointsAvailable,
    isRemoteArea: input.isRemoteArea,
    /*
     * **배송비 정책은 운영이 정한다.** 여기서 안 넘기면 계산기가 코드의
     * 바닥값을 쓰고, 운영이 바꿔 둔 무료 기준이 **견적에만 반영되지 않는다** —
     * 상품 화면은 3만원이라고 적어 놓고 결제는 5만원으로 계산하는 상태다.
     */
    shippingPolicy,
    // 등급별 적립률. 없으면 calculateCart 가 기본값을 쓴다.
    ...(viewer?.rewardPercent === undefined ? {} : { rewardPercent: viewer.rewardPercent }),
  });

  return { allocations: totals.allocations, shippingPolicy, quote: {
    lines,
    listTotal: totals.listTotal,
    productDiscount: totals.productDiscount,
    merchandiseTotal: totals.merchandiseTotal,
    couponDiscount: totals.couponDiscount,
    couponName: totals.couponDiscount > 0 ? (resolved?.name ?? null) : null,
    couponCode: totals.couponDiscount > 0 ? (resolved?.coupon.code ?? null) : null,
    /*
     * **깎이는 금액을 여기서 세어 준다.** 화면이 따로 세면 결제 금액과 어긋나는
     * 날이 오고, 그때 사람은 어느 쪽을 믿어야 할지 알 수 없다. 많이 깎이는
     * 순으로 두어 화면이 다시 정렬하지 않게 한다.
     */
    coupons: couponOffers(
      mine.map((m) => ({ coupon: m.coupon, expiresAt: m.expiresAt, ref: m })),
      payableLines,
    )
      .map((o) => ({
        code: o.coupon.code,
        name: o.ref.name,
        discount: o.discount,
        expiresAt: o.ref.expiresAt.toISOString(),
      }))
      .sort((a, b) => b.discount - a.discount || a.expiresAt.localeCompare(b.expiresAt)),
    pointsUsed: totals.pointsUsed,
    pointsAvailable,
    shippingFee: totals.shipping.fee,
    isFreeShipping: totals.shipping.isFree,
    remainingForFreeShipping: totals.shipping.remainingForFree,
    payable: totals.payable,
    rewardPoints: totals.rewardPoints,
  } };
}

function emptyLine(
  variantId: string, requestedQuantity: number, issue: LineIssue,
  productName = '삭제된 상품', optionLabel = '-',
): CartQuoteLine {
  return {
    variantId, productSlug: '', productName, brandName: '-', optionLabel,
    // 사라졌거나 내려간 상품이다. 사진을 보여 줄 것이 없다.
    imageUrl: null, imageAlt: null, blurDataUrl: null,
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
    select: { coupon: { include: { targets: { select: { targetType: true, targetId: true } } } } },
  });
  if (!issued) return null;

  const c = issued.coupon;

  // 대상 행이 하나도 없으면 장바구니 전체가 대상이다.
  // ?? [] 를 둔 이유: 나중에 select 에서 targets 를 빠뜨리면 조용히
  // undefined 가 되어 터진다 — 이 저장소에서 이미 겪은 유형이다.
  return { coupon: toCoupon(c), name: c.name };
}

/** DB 행에서 core 가 아는 쿠폰 모양으로. **한 곳에서만 옮긴다** — 코드로 찾는 길과
 * 목록으로 보여 주는 길이 다르게 옮기면 같은 쿠폰이 두 값을 갖는다. */
function toCoupon(c: CouponRow): Coupon {
  // 대상 행이 하나도 없으면 장바구니 전체가 대상이다.
  // ?? [] 를 둔 이유: 나중에 select 에서 targets 를 빠뜨리면 조용히
  // undefined 가 되어 터진다 — 이 저장소에서 이미 겪은 유형이다.
  const targets = c.targets ?? [];
  const scope =
    targets.length === 0
      ? undefined
      : {
          productIds: targets.filter((t) => t.targetType === 'PRODUCT').map((t) => t.targetId),
          brandIds: targets.filter((t) => t.targetType === 'BRAND').map((t) => t.targetId),
          categoryIds: targets.filter((t) => t.targetType === 'CATEGORY').map((t) => t.targetId),
        };

  const base = { code: c.code, minimumOrder: won(c.minimumOrder), ...(scope ? { scope } : {}) };
  return c.kind === 'AMOUNT'
    ? { kind: 'amount', value: won(c.value), ...base }
    : {
        kind: 'percent', percent: c.percent,
        maxDiscount: c.maxDiscount === null ? null : won(c.maxDiscount),
        ...base,
      };
}

interface CouponRow {
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly value: number;
  readonly percent: number;
  readonly maxDiscount: number | null;
  readonly minimumOrder: number;
  readonly targets?: readonly { targetType: string; targetId: string }[] | undefined;
}

/**
 * 이 사람이 지금 쓸 수 있는 쿠폰 전부.
 *
 * **못 쓰는 것까지 다 가져오지는 않는다** — 만료됐거나 이미 쓴 것은 장바구니와
 * 무관하게 못 쓴다. 다만 최소 주문 금액이 모자라서 못 쓰는 것은 가져온다.
 * 그건 조금 더 담으면 쓸 수 있다는 뜻이라 화면이 말해 줄 값어치가 있다.
 */
async function usableCoupons(userId: string | null): Promise<
  readonly { coupon: Coupon; name: string; expiresAt: Date }[]
> {
  if (!userId) return [];

  const now = new Date();
  const rows = await prisma.userCoupon.findMany({
    where: {
      userId,
      usedAt: null,
      expiresAt: { gt: now },
      coupon: { isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    },
    select: {
      expiresAt: true,
      coupon: { include: { targets: { select: { targetType: true, targetId: true } } } },
    },
  });

  return rows.map((r) => ({ coupon: toCoupon(r.coupon), name: r.coupon.name, expiresAt: r.expiresAt }));
}

/**
 * 옵션 행을 판매 가능 판정의 모양으로 옮긴다. 옵션 바꾸기·다시 담기 창구도 이것을 쓴다 —
 * 행에서 무엇을 읽는지까지 한 곳에 두어야 판정이 한 벌로 남는다.
 */
export function variantStateOf(v: {
  readonly isActive: boolean;
  readonly product: {
    readonly status: ProductStatus;
    readonly deletedAt: Date | null;
    readonly brand: { readonly merchant: { readonly status: string } | null };
  };
}): VariantState {
  return {
    isActive: v.isActive,
    productStatus: v.product.status,
    productDeleted: v.product.deletedAt !== null,
    // 자사 직매입 브랜드는 가맹점이 없다 — 그때는 막지 않는다
    merchantStatus: v.product.brand.merchant?.status ?? null,
  };
}
