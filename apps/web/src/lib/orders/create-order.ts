import 'server-only';
import { prisma } from '@shop/db';
import {
  generateOrderNumber, INITIAL_ORDER_STATUS, won,
  type OrderItemDraft, type ShippingSnapshot, type Won,
} from '@shop/core';
import type {
  CreateOrderRequest, CreateOrderResponse, OrderErrorCode,
} from '@shop/contract';
import { ORDER_ERROR_MESSAGE } from '@shop/contract';
import { quoteCart } from '~/lib/queries/cart';

export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    readonly variantIds: readonly string[] = [],
  ) {
    super(ORDER_ERROR_MESSAGE[code]);
    this.name = 'OrderError';
  }
}

/** 주문번호가 충돌했을 때 다시 뽑는 횟수 */
const ORDER_NO_RETRIES = 5;

/**
 * 주문을 만든다.
 *
 * 금액은 요청을 믿지 않고 서버가 다시 계산한다(quoteCart).
 * 그다음 **하나의 트랜잭션 안에서** 재고를 깎고, 포인트를 차감하고,
 * 쿠폰을 사용 처리하고, 주문을 남긴다. 하나라도 실패하면 전부 되돌아간다.
 *
 * 주문 상태는 PENDING 으로 시작한다. 결제 승인이 나야 주문이 성립하므로
 * 생성 시점에 PAID 를 넣으면 승인 전에 결제된 것처럼 보인다.
 */
export async function createOrder(
  input: CreateOrderRequest,
  user: { id: string; pointBalance: number },
): Promise<CreateOrderResponse> {
  const shipping = await resolveShipping(input, user.id);

  const quote = await quoteCart(
    {
      lines: input.lines,
      ...(input.couponCode ? { couponCode: input.couponCode } : {}),
      ...(input.pointsToUse ? { pointsToUse: input.pointsToUse } : {}),
      isRemoteArea: shipping.isRemoteArea,
    },
    user,
  );

  const buyable = quote.lines.filter((l) => l.quantity > 0);
  if (buyable.length === 0) throw new OrderError('EMPTY_ORDER');

  // 품절·판매중지가 하나라도 있으면 주문을 만들지 않는다. 나머지만 조용히
  // 처리하면 사용자가 무엇을 샀는지 모른 채 결제하게 된다.
  const broken = quote.lines.filter((l) => l.issue !== null);
  if (broken.length > 0) {
    throw new OrderError('OUT_OF_STOCK', broken.map((l) => l.variantId));
  }

  if (input.pointsToUse !== undefined && quote.pointsUsed < input.pointsToUse) {
    throw new OrderError('INSUFFICIENT_POINTS');
  }
  if (input.couponCode !== undefined && quote.couponDiscount === 0) {
    throw new OrderError('COUPON_INVALID');
  }

  // 스냅샷에 필요한 값(가맹점·대표 이미지)은 견적에 없어 따로 읽는다
  const details = await loadSnapshotDetails(buyable.map((l) => l.variantId));

  const items: OrderItemDraft[] = buyable.map((l) => {
    const d = details.get(l.variantId);
    return {
      variantId: l.variantId,
      merchantId: d?.merchantId ?? null,
      productName: l.productName,
      brandName: l.brandName,
      optionLabel: l.optionLabel,
      imageUrl: d?.imageUrl ?? null,
      listPrice: won(l.listPrice),
      unitPrice: won(l.unitPrice),
      quantity: l.quantity,
      subtotal: won(l.subtotal),
    };
  });

  const usedCouponId = input.couponCode
    ? await findUsableCouponId(user.id, input.couponCode)
    : null;

  return withOrderNumberRetry(async (orderNo) =>
    prisma.$transaction(async (tx) => {
      // ── 1) 재고 차감. 조건부 UPDATE 로 경쟁을 막는다.
      //    읽고 나서 쓰면 두 주문이 같은 재고를 보고 둘 다 성공한다.
      for (const item of items) {
        const { count } = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity }, isActive: true },
          data: { stock: { decrement: item.quantity } },
        });
        if (count === 0) throw new OrderError('OUT_OF_STOCK', [item.variantId]);
      }

      // ── 2) 포인트 차감. 같은 이유로 조건부 UPDATE.
      if (quote.pointsUsed > 0) {
        const { count } = await tx.user.updateMany({
          where: { id: user.id, pointBalance: { gte: quote.pointsUsed } },
          data: { pointBalance: { decrement: quote.pointsUsed } },
        });
        if (count === 0) throw new OrderError('INSUFFICIENT_POINTS');
      }

      // ── 3) 쿠폰 사용 처리. 아직 안 쓴 것만 잡히도록 조건을 건다.
      if (usedCouponId) {
        const { count } = await tx.userCoupon.updateMany({
          where: { id: usedCouponId, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (count === 0) throw new OrderError('COUPON_INVALID');
      }

      // ── 4) 주문. 모든 값이 스냅샷이다.
      const order = await tx.order.create({
        data: {
          orderNo,
          userId: user.id,
          status: INITIAL_ORDER_STATUS,
          listTotal: quote.listTotal,
          productDiscount: quote.productDiscount,
          couponDiscount: quote.couponDiscount,
          pointsUsed: quote.pointsUsed,
          shippingFee: quote.shippingFee,
          payable: quote.payable,
          rewardPoints: quote.rewardPoints,
          recipient: shipping.recipient,
          recipientPhone: shipping.recipientPhone,
          postalCode: shipping.postalCode,
          address1: shipping.address1,
          address2: shipping.address2,
          isRemoteArea: shipping.isRemoteArea,
          deliveryMemo: shipping.deliveryMemo,
          browserSessionId: input.browserSessionId ?? null,
          usedCouponId,
          items: {
            create: items.map((i) => ({
              variantId: i.variantId,
              merchantId: i.merchantId,
              productName: i.productName,
              brandName: i.brandName,
              optionLabel: i.optionLabel,
              imageUrl: i.imageUrl,
              listPrice: i.listPrice,
              unitPrice: i.unitPrice,
              quantity: i.quantity,
              subtotal: i.subtotal,
              status: INITIAL_ORDER_STATUS,
            })),
          },
          statusLogs: {
            create: { from: null, to: INITIAL_ORDER_STATUS, actor: 'system', note: '주문 생성' },
          },
          payment: {
            create: { method: input.paymentMethod, status: 'READY', amount: quote.payable },
          },
        },
        select: { id: true, orderNo: true, payable: true, status: true },
      });

      // ── 5) 포인트 원장. 잔액만 깎고 끝내면 왜 줄었는지 설명할 수 없다.
      if (quote.pointsUsed > 0) {
        await tx.pointTransaction.create({
          data: {
            userId: user.id,
            amount: -quote.pointsUsed,
            reason: 'USE_PURCHASE',
            orderId: order.id,
            note: `주문 ${orderNo}`,
          },
        });
      }

      return {
        orderNo: order.orderNo,
        payable: order.payable as Won,
        status: order.status,
      };
    }),
  );
}

/** 저장된 배송지를 쓰거나, 새로 입력한 값을 쓴다 */
async function resolveShipping(
  input: CreateOrderRequest,
  userId: string,
): Promise<ShippingSnapshot> {
  if (input.addressId) {
    const a = await prisma.address.findFirst({
      // 남의 배송지 id 를 넣어 주소를 훔쳐볼 수 없게 소유자까지 확인한다
      where: { id: input.addressId, userId },
    });
    if (!a) throw new OrderError('ADDRESS_NOT_FOUND');
    return {
      recipient: a.recipient,
      recipientPhone: a.phone,
      postalCode: a.postalCode,
      address1: a.address1,
      address2: a.address2,
      isRemoteArea: a.isRemoteArea,
      deliveryMemo: input.deliveryMemo ?? null,
    };
  }

  const a = input.address!;
  return {
    recipient: a.recipient,
    recipientPhone: a.phone,
    postalCode: a.postalCode,
    address1: a.address1,
    address2: a.address2 ?? null,
    isRemoteArea: a.isRemoteArea,
    deliveryMemo: input.deliveryMemo ?? null,
  };
}

async function loadSnapshotDetails(variantIds: readonly string[]) {
  const rows = await prisma.productVariant.findMany({
    where: { id: { in: [...variantIds] } },
    select: {
      id: true,
      product: {
        select: {
          brand: { select: { merchantId: true } },
          images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { merchantId: r.product.brand.merchantId, imageUrl: r.product.images[0]?.url ?? null },
    ]),
  );
}

async function findUsableCouponId(userId: string, code: string): Promise<string | null> {
  const now = new Date();
  const row = await prisma.userCoupon.findFirst({
    where: {
      userId, usedAt: null, expiresAt: { gt: now },
      coupon: { code, isActive: true, startsAt: { lte: now }, endsAt: { gte: now } },
    },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * 주문번호는 난수라 아주 드물게 충돌한다. unique 제약이 잡아 주면 다시 뽑는다.
 * 미리 조회해서 비어 있는지 확인하는 방식은 경쟁 조건을 못 막는다.
 */
async function withOrderNumberRetry<T>(run: (orderNo: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < ORDER_NO_RETRIES; attempt += 1) {
    try {
      return await run(generateOrderNumber());
    } catch (error) {
      if (attempt < ORDER_NO_RETRIES - 1 && isOrderNoConflict(error)) continue;
      throw error;
    }
  }
  throw new Error('주문번호를 생성하지 못했습니다');
}

function isOrderNoConflict(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  // 문자열이 아닌 값에 String() 을 씌우면 "[object Object]" 가 되어
  // 'orderNo' 를 절대 못 찾는다. 그러면 재시도가 조용히 실패한다.
  if (Array.isArray(target)) return target.includes('orderNo');
  return typeof target === 'string' && target.includes('orderNo');
}
