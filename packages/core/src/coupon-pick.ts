import { calculateCart, type CartLine, type Coupon } from './cart';
import { ZERO, type Won } from './money';

/**
 * 장바구니 하나에 쿠폰 여럿을 대 보고 **가장 많이 깎이는 것**을 고른다.
 *
 * 쿠폰을 받을 수는 있는데 쓸 수가 없었다. 서버는 코드를 받으면 할인을 계산할
 * 줄 알았지만 어느 화면도 코드를 보내지 않았고, 쿠폰함은 받아 두기만 하는
 * 자리였다.
 *
 * **사람에게 코드를 외우게 하지 않는다.** 쿠폰이 여럿이면 어느 것이 이 장바구니에
 * 가장 유리한지는 사람이 하나씩 넣어 봐야 알 수 있다 — 정률 쿠폰은 상한이
 * 걸리고, 정액 쿠폰은 최소 주문 금액이 걸리고, 어떤 것은 특정 브랜드에만
 * 붙는다. 그 계산은 우리가 한다.
 *
 * **여기서 새로 세지 않는다.** 장바구니 계산기를 쿠폰만 바꿔 가며 그대로
 * 부른다. 할인액을 여기서 다시 구하면 견적이 말하는 금액과 어긋나는 날이
 * 오고, 그때 사람은 어느 쪽을 믿어야 할지 알 수 없다 — 화면에 200원 덜
 * 깎였다고 적혀 있는데 결제는 제대로 됐다면 그것도 신고가 된다.
 */

export interface CouponCandidate<T> {
  /** 쿠폰 규칙 */
  readonly coupon: Coupon;
  /** 언제까지 쓸 수 있는가. 같은 금액이면 먼저 죽는 것을 쓴다. */
  readonly expiresAt: Date;
  /** 화면이 다시 찾을 수 있게 들려 보내는 값 */
  readonly ref: T;
}

export interface CouponPick<T> {
  readonly ref: T;
  readonly coupon: Coupon;
  readonly discount: Won;
}

/** 이 장바구니에서 이 쿠폰이 깎아 주는 금액. 0 이면 쓸 수 없다는 뜻이다. */
export function discountFor(coupon: Coupon, lines: readonly CartLine[]): Won {
  return calculateCart({ lines, coupon }).couponDiscount;
}

/**
 * 가장 많이 깎이는 쿠폰. 하나도 못 쓰면 null.
 *
 * **같은 금액이면 먼저 만료되는 것을 쓴다.** 어느 것을 써도 오늘 내는 돈은
 * 같은데, 오래 남는 쪽을 아껴 두면 다음에 또 쓸 수 있다. 만료일까지 같으면
 * 코드 순으로 정해 늘 같은 답이 나오게 한다 — 새로고침할 때마다 다른 쿠폰이
 * 붙으면 사람은 자기가 무엇을 눌렀는지 알 수 없다.
 */
export function bestCoupon<T>(
  candidates: readonly CouponCandidate<T>[],
  lines: readonly CartLine[],
): CouponPick<T> | null {
  let best: (CouponPick<T> & { expiresAt: Date }) | null = null;

  for (const candidate of candidates) {
    const discount = discountFor(candidate.coupon, lines);
    if (discount <= ZERO) continue;

    if (
      best === null ||
      discount > best.discount ||
      (discount === best.discount &&
        (candidate.expiresAt.getTime() < best.expiresAt.getTime() ||
          (candidate.expiresAt.getTime() === best.expiresAt.getTime() &&
            candidate.coupon.code < best.coupon.code)))
    ) {
      best = { ref: candidate.ref, coupon: candidate.coupon, discount, expiresAt: candidate.expiresAt };
    }
  }

  return best === null ? null : { ref: best.ref, coupon: best.coupon, discount: best.discount };
}

/**
 * 쿠폰마다 이 장바구니에서 얼마가 깎이는지.
 *
 * **못 쓰는 것도 함께 돌려준다.** 목록에서 빼 버리면 "내 쿠폰이 어디 갔지" 가
 * 되고, 최소 주문 금액이 모자라 그런 것이라면 조금 더 담으면 쓸 수 있다는
 * 사실도 함께 사라진다.
 */
export function couponOffers<T>(
  candidates: readonly CouponCandidate<T>[],
  lines: readonly CartLine[],
): readonly CouponPick<T>[] {
  return candidates.map((c) => ({
    ref: c.ref,
    coupon: c.coupon,
    discount: discountFor(c.coupon, lines),
  }));
}

/**
 * 견적에 쿠폰을 **어떻게** 붙일지.
 *
 * · `NONE`  — 붙이지 않는다. 사람이 "쓰지 않기" 를 골랐다(코드를 함께 보냈더라도 — 마지막으로 누른 것이 그것이다).
 * · `ASKED` — 보낸 코드를 붙인다.
 * · `AUTO`  — 가장 많이 깎이는 것을 서버가 고른다.
 *
 * **자동 고르기는 명시적으로 부탁할 때만이다.** 한동안 "아무 말도 없으면 고른다" 였는데, 견적을 부르는 곳이
 * 화면만이 아니었다 — 주문 생성도 같은 견적을 부르면서 쿠폰에 대해 아무 말도 하지 않았다. 그러면 견적은 쿠폰을
 * 골라 결제 금액을 깎는데, 주문 생성은 "보낸 코드가 없다" 며 그 쿠폰을 **쓴 것으로 처리하지 않았다.**
 * "쓰지 않기" 를 고른 손님도 할인을 받았고, 같은 쿠폰이 끝없이 다시 깎였다.
 *
 * 화면 창구는 계약의 기본값(`useCoupon: true`)으로 늘 부탁하므로 화면에서 달라지는 것은 없다. 서버 안에서
 * 부르는 자리는 이제 **보낸 코드만** 붙인다 — 주문은 이름 붙은 쿠폰만 쓰고, 쓴 것은 소진한다.
 */
export type CouponChoice = 'NONE' | 'ASKED' | 'AUTO';

export function couponChoice(input: {
  /** true 여야 서버가 고른다. 비워 두면 고르지 않는다 */
  readonly useCoupon: boolean | undefined;
  readonly hasCode: boolean;
}): CouponChoice {
  if (input.useCoupon === false) return 'NONE';
  if (input.hasCode) return 'ASKED';
  return input.useCoupon === true ? 'AUTO' : 'NONE';
}
