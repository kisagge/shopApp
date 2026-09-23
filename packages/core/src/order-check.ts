/**
 * 주문을 만들지 않는 이유.
 *
 * **이 목록을 보려면 create-order.ts 를 열어야 했다.** 335줄짜리 함수 가운데에 여섯 개의
 * 검사가 흩어져 있었고, 순서에 얽힌 사연까지 그 사이에 적혀 있었다 — "왜 이 주문이
 * 거절됐나" 에 답하려면 트랜잭션과 스냅샷 만들기를 지나쳐 읽어야 했다.
 *
 * 규칙만 여기로 옮긴다. 읽기도, 쓰기도, 오류 클래스도 없다 — 무엇이 어긋났는지만 말한다.
 */

/** 견적이 내놓은 한 줄 중, 거절 판단에 쓰는 것만 */
export interface OrderQuoteLine {
  readonly variantId: string;
  /** 품절·판매중지 같은 문제. 없으면 null */
  readonly issue: string | null;
  readonly quantity: number;
}

export interface OrderCheckInput {
  readonly lines: readonly OrderQuoteLine[];
  /** 견적이 실제로 쓴 포인트 */
  readonly pointsUsed: number;
  /** 견적이 실제로 깎은 쿠폰 할인 */
  readonly couponDiscount: number;
  /** 손님이 쓰겠다고 한 포인트. 안 쓰겠다면 undefined */
  readonly requestedPoints: number | undefined;
  /** 손님이 보낸 쿠폰 코드가 있는가 */
  readonly hasCouponCode: boolean;
  /** 견적이 나눈 줄 몫의 수 */
  readonly allocationCount: number;
}

export type OrderRejection =
  /** 품절·판매중지인 줄이 있다. 어느 것인지 함께 알린다 */
  | { readonly reason: 'OUT_OF_STOCK'; readonly variantIds: readonly string[] }
  | { readonly reason: 'EMPTY_ORDER' }
  | { readonly reason: 'INSUFFICIENT_POINTS' }
  | { readonly reason: 'COUPON_INVALID' }
  /**
   * 손님이 고칠 수 있는 것이 아니라 **우리 쪽이 어긋난 것**. 부르는 쪽은 이것을
   * 사용자 메시지로 바꾸지 않고 그대로 터뜨린다 — 조용히 넘기면 돈이 샌다.
   */
  | { readonly reason: 'INVARIANT'; readonly detail: string };

/**
 * 이 견적으로 주문을 만들어도 되는가. 안 되면 그 이유, 되면 null.
 *
 * **순서가 중요하다.** 품절 검사가 빈 주문 검사보다 앞이다. 반대로 두었더니 한 줄짜리
 * 주문이 품절됐을 때 "주문할 수 있는 상품이 없습니다" 가 나갔다 — 손님 눈앞에는 상품이
 * 있는데 말이다. 마지막 한 개를 두 사람이 동시에 사는 검사가 그것을 잡았다: 막는 것은
 * 제대로 막고 있었고, **말이 틀렸다.**
 */
export function checkOrder(input: OrderCheckInput): OrderRejection | null {
  /*
   * 품절이면 수량이 0 으로 깎이면서 issue 도 함께 선다(queries/cart). 하나라도 있으면
   * 주문을 만들지 않는다 — 나머지만 조용히 처리하면 사용자가 무엇을 샀는지 모른 채 결제한다.
   */
  const broken = input.lines.filter((l) => l.issue !== null);
  if (broken.length > 0) {
    return { reason: 'OUT_OF_STOCK', variantIds: broken.map((l) => l.variantId) };
  }

  // 살 수 있는 줄이 하나도 없다 — 위에서 걸리지 않은 경우를 위한 그물이다
  const buyable = input.lines.filter((l) => l.quantity > 0);
  if (buyable.length === 0) return { reason: 'EMPTY_ORDER' };

  if (input.requestedPoints !== undefined && input.pointsUsed < input.requestedPoints) {
    return { reason: 'INSUFFICIENT_POINTS' };
  }
  if (input.hasCouponCode && input.couponDiscount === 0) {
    return { reason: 'COUPON_INVALID' };
  }

  /*
   * **코드 없이 온 주문에 쿠폰 할인이 붙으면 만들지 않는다.**
   *
   * 쿠폰을 쓴 것으로 처리하는 일은 보낸 코드로만 한다. 그러니 코드 없는 주문의 할인은
   * 누구의 쿠폰도 소진하지 않은 할인이다 — 한동안 실제로 그랬다(견적이 아무 말 없으면
   * 쿠폰을 골랐다). 견적은 이제 부탁받지 않으면 고르지 않지만(couponChoice), 돈이 새는
   * 자리라 여기서도 막는다.
   */
  if (!input.hasCouponCode && input.couponDiscount > 0) {
    return {
      reason: 'INVARIANT',
      detail: `코드 없는 주문에 쿠폰 할인 ${input.couponDiscount}원이 붙었다 — 견적과 주문이 어긋났다`,
    };
  }

  /*
   * 견적의 몫은 **살 수 있는 줄의 순서**로 온다(수량 0 인 줄은 계산에 안 들어간다).
   * 순서가 어긋나면 쿠폰 몫이 엉뚱한 줄에 박히므로 길이부터 맞춰 본다.
   */
  if (input.allocationCount !== buyable.length) {
    return {
      reason: 'INVARIANT',
      detail: `줄 몫(${input.allocationCount})과 살 수 있는 줄(${buyable.length})의 수가 다르다`,
    };
  }

  return null;
}
