import { calculateCart, won, MoneyError, type CartLine, type Coupon } from '@shop/core';
import { cartQuoteRequestSchema, type CartQuoteResponse } from '@shop/contract';
import { NextResponse } from 'next/server';

/**
 * 장바구니 견적. 금액 계산은 절대 클라이언트를 믿지 않는다 —
 * 화면이 보여주는 금액과 결제될 금액은 항상 이 엔드포인트가 정한다.
 *
 * 지금은 요청에 담긴 가격을 그대로 쓰지만, DB가 붙으면 variantId로 실제 가격을
 * 조회해 덮어쓴다. 그 전까지도 계산 로직만은 서버 한 곳에 둔다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' },
      { status: 400 },
    );
  }

  const parsed = cartQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fields[issue.path.join('.') || '_'] = issue.message;
    }
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '요청 값을 확인해 주세요.', fields },
      { status: 400 },
    );
  }

  const input = parsed.data;

  try {
    const totals = calculateCart({
      lines: input.lines.map<CartLine>((l) => ({
        variantId: l.variantId,
        productName: l.productName,
        listPrice: won(l.listPrice),
        discountPercent: l.discountPercent,
        quantity: l.quantity,
      })),
      coupon: input.coupon ? toCoupon(input.coupon) : undefined,
      pointsToUse: input.pointsToUse === undefined ? undefined : won(input.pointsToUse),
      // 보유 포인트는 세션에서 읽어야 한다. 인증이 붙기 전까지는 요청값을 그대로 상한으로 쓴다.
      pointsAvailable: input.pointsToUse === undefined ? undefined : won(input.pointsToUse),
      isRemoteArea: input.isRemoteArea,
    });

    const response: CartQuoteResponse = {
      listTotal: totals.listTotal,
      productDiscount: totals.productDiscount,
      merchandiseTotal: totals.merchandiseTotal,
      couponDiscount: totals.couponDiscount,
      pointsUsed: totals.pointsUsed,
      shippingFee: totals.shipping.fee,
      isFreeShipping: totals.shipping.isFree,
      remainingForFreeShipping: totals.shipping.remainingForFree,
      payable: totals.payable,
      rewardPoints: totals.rewardPoints,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof MoneyError) {
      return NextResponse.json({ code: 'INVALID_AMOUNT', message: error.message }, { status: 400 });
    }
    throw error;
  }
}

type CouponInput = NonNullable<Awaited<ReturnType<typeof cartQuoteRequestSchema.parse>>['coupon']>;

function toCoupon(c: CouponInput): Coupon {
  return c.kind === 'amount'
    ? { kind: 'amount', code: c.code, value: won(c.value), minimumOrder: won(c.minimumOrder) }
    : {
        kind: 'percent', code: c.code, percent: c.percent,
        maxDiscount: c.maxDiscount === null ? null : won(c.maxDiscount),
        minimumOrder: won(c.minimumOrder),
      };
}
