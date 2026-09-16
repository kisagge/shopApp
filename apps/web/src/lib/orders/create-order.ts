import 'server-only';
import { prisma } from '@shop/db';
import { DEFAULT_LOCALE, type Locale } from '@shop/i18n';
import {
  generateOrderNumber, INITIAL_ORDER_STATUS, won,
  type OrderItemDraft, type ShippingSnapshot, type Won,
  isRemoteAreaPostalCode, crossedLowStock,
} from '@shop/core';
import type {
  CreateOrderRequest, CreateOrderResponse, OrderErrorCode,
} from '@shop/contract';
import { ORDER_ERROR_MESSAGE } from '@shop/contract';
import { quoteCartDetailed } from '~/lib/queries/cart';
import { releaseAbandonedHolds } from './release-holds';
import { afterResponse } from '~/lib/api/after-response';
import { notifyLowStock } from '~/lib/notifications/low-stock';

/**
 * 품절에 막혔을 때 한 번에 풀어 볼 주문 수.
 *
 * 이 자리는 사람이 결제 버튼을 누르고 기다리는 중이다. 밀린 것을 다
 * 따라잡는 것은 배치의 몫이고, 여기서는 **지금 사려는 물건을 막고 있는
 * 몇 건**만 본다.
 */
const RETRY_RELEASE_LIMIT = 5;

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
  // 적립률까지 함께 받는다 — 견적과 같은 값이어야 한다(getQuoteViewer)
  user: { id: string; pointBalance: number; rewardPercent?: number },
  /**
   * 주문한 그때의 언어. 안내 메일이 이 값을 쓴다.
   *
   * **요청 본문이 아니라 서버가 읽은 값을 받는다.** 화면이 보내는 값을
   * 그대로 믿으면 남의 주문 메일 언어를 바꿔 넣을 수 있고, 무엇보다
   * 사용자가 실제로 본 화면의 말과 어긋날 수 있다.
   */
  locale: Locale = DEFAULT_LOCALE,
): Promise<CreateOrderResponse> {
  /*
   * **서로 모르는 조회는 한꺼번에 보낸다.**
   *
   * 넷 다 서로의 결과를 쓰지 않는데 하나씩 줄을 서 있었다. 이 배포는 DB
   * 왕복 하나가 141ms 다(질의 내용과 무관하게 고정이었다 — 값이 아니라
   * 거리에 묶인 값이다). 줄을 세우면 4×141, 함께 보내면 141 이다.
   *
   * **`allSettled` 인 이유는 순서 때문이다.** `all` 은 먼저 깨진 것을
   * 던지므로, 이미 만든 주문이 있는데 배송지가 지워진 경우 예전에는 그
   * 주문을 그대로 돌려주던 것이 ADDRESS_NOT_FOUND 로 바뀐다. 함께 보내되
   * **보는 순서는 그대로** 둔다.
   *
   * 스냅샷 조회만 범위가 다르다. 예전에는 견적이 끝난 뒤 살 수 있는 것만
   * 읽었는데, 그러면 견적을 기다려야 한다. 요청에 담긴 것 전부를 미리 읽고
   * 나중에 골라 쓴다 — 읽는 행이 조금 늘고 왕복이 하나 준다.
   */
  const [alreadyMade, shippingRead, couponRead, detailsRead] = await Promise.allSettled([
    input.idempotencyKey
      ? findByIdempotencyKey(input.idempotencyKey, user.id)
      : Promise.resolve(null),
    resolveShipping(input, user.id),
    input.couponCode ? findUsableCouponId(user.id, input.couponCode) : Promise.resolve(null),
    loadSnapshotDetails(input.lines.map((l) => l.variantId)),
  ]);

  /*
   * **이미 만든 주문이면 그것을 그대로 돌려준다.**
   *
   * 버튼을 두 번 눌렀거나 응답을 못 받아 다시 보낸 경우다. 여기서 걸러
   * 내지 않으면 재고가 두 번 깎이고, 결제되지 않은 주문이 하나 더 남아
   * 그 재고를 물고 있는다.
   */
  if (alreadyMade.status === 'rejected') throw alreadyMade.reason;
  if (alreadyMade.value) return alreadyMade.value;

  if (shippingRead.status === 'rejected') throw shippingRead.reason;
  const shipping = shippingRead.value;

  const { quote, allocations, shippingPolicy } = await quoteCartDetailed(
    {
      lines: input.lines,
      ...(input.couponCode ? { couponCode: input.couponCode } : {}),
      ...(input.pointsToUse ? { pointsToUse: input.pointsToUse } : {}),
      isRemoteArea: shipping.isRemoteArea,
    },
    user,
  );

  /*
   * **왜 안 되는지를 먼저 말한다.**
   *
   * 품절이면 수량이 0 으로 깎이면서 issue 도 함께 선다(queries/cart). 그런데
   * 빈 주문 검사가 앞에 있어서, 한 줄짜리 주문이 품절되면 "주문할 수 있는
   * 상품이 없습니다" 가 나갔다 — 손님 눈앞에는 상품이 있는데. 마지막 한 개를
   * 두 사람이 동시에 사는 검사가 이걸 잡았다: 진 쪽이 품절이 아니라 빈 주문을
   * 받았다(막는 것은 제대로 막고 있었고, 말이 틀렸다).
   *
   * 품절·판매중지가 하나라도 있으면 주문을 만들지 않는다. 나머지만 조용히
   * 처리하면 사용자가 무엇을 샀는지 모른 채 결제하게 된다.
   */
  const broken = quote.lines.filter((l) => l.issue !== null);
  if (broken.length > 0) {
    throw new OrderError('OUT_OF_STOCK', broken.map((l) => l.variantId));
  }

  // 살 수 있는 줄이 하나도 없다 — 위에서 걸리지 않은 경우를 위한 그물이다
  const buyable = quote.lines.filter((l) => l.quantity > 0);
  if (buyable.length === 0) throw new OrderError('EMPTY_ORDER');

  if (input.pointsToUse !== undefined && quote.pointsUsed < input.pointsToUse) {
    throw new OrderError('INSUFFICIENT_POINTS');
  }
  if (input.couponCode !== undefined && quote.couponDiscount === 0) {
    throw new OrderError('COUPON_INVALID');
  }

  // 스냅샷에 필요한 값(가맹점·대표 이미지)은 견적에 없어 따로 읽는다 — 위에서 함께 읽었다
  if (detailsRead.status === 'rejected') throw detailsRead.reason;
  const details = detailsRead.value;

  /*
   * 견적의 몫은 **살 수 있는 줄의 순서**로 온다(수량 0 인 줄은 계산에 안 들어간다) —
   * 여기 `buyable` 과 같은 거름이다. 순서가 어긋나면 쿠폰 몫이 엉뚱한 줄에 박히므로
   * 길이부터 맞춰 본다.
   */
  if (allocations.length !== buyable.length) {
    throw new Error(`줄 몫(${allocations.length})과 살 수 있는 줄(${buyable.length})의 수가 다르다`);
  }

  const items: OrderItemDraft[] = buyable.map((l, index) => {
    const d = details.get(l.variantId);
    const share = allocations[index]!;
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
      couponShare: share.couponShare,
      pointsShare: share.pointsShare,
      rewardShare: share.rewardShare,
    };
  });

  if (couponRead.status === 'rejected') throw couponRead.reason;
  const usedCouponId = couponRead.value;

  /*
   * 동시에 두 번 들어오면 위의 조회는 둘 다 빈손으로 지나간다. 그때는
   * 유니크 제약이 두 번째를 막고, **트랜잭션이 통째로 되돌아가므로 재고도
   * 함께 돌아온다.** 그 뒤에 먼저 만들어진 주문을 읽어 돌려준다.
   */
  try {
    return await createWithRetry();
  } catch (error) {
    if (input.idempotencyKey && isIdempotencyConflict(error)) {
      const already = await findByIdempotencyKey(input.idempotencyKey, user.id);
      if (already) return already;
    }

    /*
     * **품절이라고 말하기 전에, 정말 없는지 한 번 더 본다.**
     *
     * 주문을 만드는 순간 재고가 깎이고, 결제하지 않고 떠난 주문은 회수
     * 배치가 돌 때까지 그 재고를 물고 있다. 그 배치는 하루에 한 번 돈다
     * (무료 요금제가 크론을 그렇게 묶는다). 기한은 30분인데 회수는 24시간
     * 마다라, 그 사이에는 **아무도 안 산 물건이 품절로 보인다.**
     *
     * 사는 사람에게는 그냥 품절이다. 왜 없는지 알 방법도, 기다릴 이유를
     * 알 방법도 없다.
     *
     * 그래서 막혔을 때만 그 변형의 버려진 주문을 풀고 한 번 다시 해 본다.
     * **성공하는 주문에는 아무 값도 붙지 않는다** — 여기까지 오는 것은
     * 이미 실패한 요청뿐이다.
     */
    if (error instanceof OrderError && error.code === 'OUT_OF_STOCK') {
      const { released } = await releaseAbandonedHolds(new Date(), {
        variantIds: error.variantIds,
        // 사는 사람을 기다리게 하는 자리다. 밀린 것을 다 따라잡는 것은 배치의 몫이다.
        limit: RETRY_RELEASE_LIMIT,
      });

      // 푼 것이 없으면 진짜 품절이다. 같은 실패를 두 번 겪게 하지 않는다.
      if (released > 0) return await createWithRetry();
    }

    throw error;
  }

  async function createWithRetry(): Promise<CreateOrderResponse> {
    /*
     * 기준을 넘긴 옵션. **시도마다 새로 비운다** — 주문번호가 부딪혀 트랜잭션이
     * 되돌아가면 그 시도의 재고 차감도 없던 일이 되므로, 그때 모은 것을 들고
     * 가면 일어나지 않은 일로 알림이 간다.
     */
    let lowStock: string[] = [];

    const created = await withOrderNumberRetry(async (orderNo) => {
      lowStock = [];
      return prisma.$transaction(async (tx) => {
        // ── 1) 재고 차감. 조건부 UPDATE 로 경쟁을 막는다.
        //    읽고 나서 쓰면 두 주문이 같은 재고를 보고 둘 다 성공한다.
        for (const item of items) {
          const { count } = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity }, isActive: true },
            data: { stock: { decrement: item.quantity } },
          });
          if (count === 0) throw new OrderError('OUT_OF_STOCK', [item.variantId]);

          /*
           * **이 주문이 기준을 넘겼는지 트랜잭션 안에서 본다.**
           *
           * 방금 깎은 줄은 이 트랜잭션이 잠그고 있어서, 여기서 읽으면 **이 주문이
           * 깎은 직후의 값**이 나온다. 커밋 뒤에 읽으면 그 사이 다른 주문이 깎은
           * 것까지 섞여서, 6→5 를 넘긴 주문이 아니라 5→4 를 만든 주문이 알림을
           * 보내거나 둘 다 안 보낸다.
           *
           * 깎기 전 값은 되묻지 않는다 — 조건부 UPDATE 가 정확히 quantity 만큼
           * 깎았으므로 더하면 된다.
           */
          const after = await tx.productVariant.findUnique({
            where: { id: item.variantId },
            select: { stock: true },
          });
          if (after && crossedLowStock(after.stock + item.quantity, after.stock)) {
            lowStock.push(item.variantId);
          }
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
            locale,
            idempotencyKey: input.idempotencyKey ?? null,
            usedCouponId,
            // 부분 취소가 배송비를 뗄 때 **주문한 날의 기준**을 쓴다
            shippingPolicy: { ...shippingPolicy },
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
                couponShare: i.couponShare,
                pointsShare: i.pointsShare,
                rewardShare: i.rewardShare,
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
      });
    });

    /*
     * **커밋된 뒤에, 응답을 막지 않고** 알린다. 알림을 못 보냈다고 주문을 무를
     * 수는 없고, 사람이 그걸 기다릴 이유도 없다.
     */
    if (lowStock.length > 0) {
      const crossed = lowStock;
      /*
       * **부르는 자리에서도 삼킨다.** notifyLowStock 가 안에서 이미 삼키지만,
       * afterResponse 는 요청 밖(검사·배치)에서는 그 자리에서 돌리고 약속을
       * 돌려준다 — 그때 알림이 던지면 기다리던 **주문이 실패한다.** 알림 쪽이
       * 언제나 조용할 거라는 약속에 주문을 걸지 않는다.
       */
      await afterResponse(async () => {
        try {
          await notifyLowStock(crossed);
        } catch (error) {
          console.error('[order] 재고 부족 알림 실패 — 주문은 성립했다', { crossed }, error);
        }
      });
    }

    return created;
  }
}

/** 같은 열쇠로 이미 만들어진 주문. **남의 주문을 돌려주지 않게 소유자까지 본다.** */
async function findByIdempotencyKey(
  key: string,
  userId: string,
): Promise<CreateOrderResponse | null> {
  const order = await prisma.order.findFirst({
    where: { idempotencyKey: key, userId },
    select: { orderNo: true, payable: true, status: true },
  });
  return order === null
    ? null
    : { orderNo: order.orderNo, payable: order.payable, status: order.status };
}

function isIdempotencyConflict(error: unknown): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } };
  if (e?.code !== 'P2002') return false;
  const target = e.meta?.target;
  // 주문번호 충돌 판정과 같은 함정을 피한다 — 배열에 String() 을 씌우면
  // "[object Object]" 가 되어 무엇과도 맞지 않는다.
  if (Array.isArray(target)) return target.includes('idempotencyKey');
  return typeof target === 'string' && target.includes('idempotencyKey');
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
    // 요청이 아니라 우편번호에서 정한다. 받아 쓰면 제주 주소에 false 를
    // 보내 도서산간 추가 배송비를 피할 수 있다.
    isRemoteArea: isRemoteAreaPostalCode(a.postalCode),
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
