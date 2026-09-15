import type { OrderStatus } from './order-state';

/**
 * 반품·교환 정책.
 *
 * 순수 함수만 둔다. I/O 없음.
 *
 * 기한과 반송비 부담은 전자상거래법이 정한 선을 따른다. 단순 변심은 짧고
 * 고객이 반송비를 내며, 하자·오배송은 길고 판매자가 낸다. **이 구분을
 * 클라이언트가 고르게 두면 안 된다** — 누구나 "하자" 를 골라 반송비를
 * 넘길 수 있다. 사유는 받되 부담 주체는 서버가 사유에서 정한다.
 */

export const RETURN_TYPE = ['RETURN', 'EXCHANGE'] as const;
export type ReturnType = (typeof RETURN_TYPE)[number];

export const RETURN_TYPE_LABEL: Readonly<Record<ReturnType, string>> = {
  RETURN: '반품',
  EXCHANGE: '교환',
};

export const RETURN_REASON = ['CHANGED_MIND', 'DEFECT', 'WRONG_ITEM', 'DAMAGED'] as const;
export type ReturnReason = (typeof RETURN_REASON)[number];

export const RETURN_REASON_LABEL: Readonly<Record<ReturnReason, string>> = {
  CHANGED_MIND: '단순 변심 · 사이즈가 맞지 않음',
  DEFECT: '상품 불량',
  WRONG_ITEM: '주문과 다른 상품이 옴',
  DAMAGED: '배송 중 파손',
};

/** 반송비를 누가 내는가 */
export const RETURN_SHIPPING_PARTY = ['CUSTOMER', 'SELLER'] as const;
export type ReturnShippingParty = (typeof RETURN_SHIPPING_PARTY)[number];

/** 판매자 잘못인 사유들. 이 경우 반송비는 판매자가 낸다. */
const SELLER_FAULT: readonly ReturnReason[] = ['DEFECT', 'WRONG_ITEM', 'DAMAGED'];

/**
 * 반송비 부담 주체.
 *
 * **요청으로 받지 않고 사유에서 정한다.** 받아 쓰면 누구나 SELLER 를 보내
 * 반송비를 넘길 수 있다.
 */
export function shippingBorneBy(reason: ReturnReason): ReturnShippingParty {
  return SELLER_FAULT.includes(reason) ? 'SELLER' : 'CUSTOMER';
}

/** 신청할 수 있는 기한 (배송완료일로부터, 일) */
const WINDOW_DAYS: Readonly<Record<ReturnReason, number>> = {
  // 전자상거래법상 단순 변심은 수령일로부터 7일
  CHANGED_MIND: 7,
  // 하자·오배송은 더 길게 본다
  DEFECT: 30,
  WRONG_ITEM: 30,
  DAMAGED: 30,
};

export const returnWindowDays = (reason: ReturnReason): number => WINDOW_DAYS[reason];

/**
 * 이 상태에서 고를 수 있는 사유.
 *
 * **화면과 서버가 같은 목록을 본다.** 화면이 고를 수 없는 것을 내밀면 사람은
 * 그것을 골라 제출하고 나서야 안 된다는 말을 듣는다 — 구매확정한 주문에서
 * 단순 변심이 기본값으로 선택돼 있던 자리가 그랬다.
 */
export function availableReturnReasons(status: OrderStatus): readonly ReturnReason[] {
  // 확정은 "이대로 받겠다" 는 뜻이라 변심의 길이 닫힌다. 판매자 귀책은 남는다.
  return status === 'CONFIRMED' ? SELLER_FAULT : RETURN_REASON;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 돌려보낼 수 있는 **줄**의 상태 — 받았거나 받는 중인 것.
 *
 * 신청 창구가 고를 수 있는 줄을 거르고, 화면이 체크박스로 내미는 줄도 이것으로 거른다. 둘이
 * 따로 적으면 화면이 내민 줄을 서버가 거절한다.
 */
export const RETURNABLE_LINE_STATUS = ['SHIPPED', 'DELIVERED', 'CONFIRMED'] as const satisfies readonly OrderStatus[];

export const isReturnableLine = (line: { readonly status: OrderStatus; readonly canceledAt: Date | null }): boolean =>
  line.canceledAt === null && (RETURNABLE_LINE_STATUS as readonly OrderStatus[]).includes(line.status);

export const RETURN_STATUS = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

/** 아직 끝나지 않은 신청 — 이것이 있으면 주문을 확정하지 않는다(손님 확정·자동 확정이 같은 목록을 본다) */
export const OPEN_RETURN_STATUS = ['REQUESTED', 'APPROVED'] as const satisfies readonly ReturnStatus[];

export const isOpenReturn = (status: string): boolean => (OPEN_RETURN_STATUS as readonly string[]).includes(status);

/*
 * 이름표는 여기 없다.
 *
 * 무엇이 있는지는 규칙이고 뭐라고 부를지는 화면이다. 화면이 세 나라 말로
 * 나가면서 이 자리의 한국어 표는 맞지 않게 됐다 —
 * apps/web 의 lib/i18n/enum-labels 가 값 목록에서 열쇠를 만들고, 사전이
 * 그 열쇠를 세 벌로 가진다.
 */

export type ReturnEligibility =
  | { readonly ok: true; readonly deadline: Date; readonly borneBy: ReturnShippingParty }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * 지금 이 주문을 반품·교환 신청할 수 있는가.
 *
 * 상태와 기한을 함께 본다. 둘을 나눠 두면 화면은 상태만 보고 버튼을
 * 띄우는데 서버는 기한으로 거절해서, 눌러 봐야 안 되는 버튼이 생긴다.
 */
export function checkReturnEligibility(input: {
  readonly status: OrderStatus;
  /** 배송완료 시각. 아직이면 null */
  readonly deliveredAt: Date | null;
  readonly reason: ReturnReason;
  readonly now: Date;
}): ReturnEligibility {
  const { status, deliveredAt, reason, now } = input;

  /**
   * 구매확정 뒤에는 **판매자 귀책만** 받는다.
   *
   * 확정은 "이대로 받겠다" 는 뜻이라 단순 변심의 길은 여기서 닫힌다. 그런데
   * 물건에 하자가 있거나 다른 것이 왔다면 그건 확정과 무관한 이야기다 —
   * 확정은 사업자 편의로 둔 개념일 뿐이고, 그 한 번의 클릭으로 사람이
   * 판매자 잘못까지 떠안기로 한 것은 아니다.
   *
   * 예전에는 확정이면 사유를 묻지도 않고 막고 "고객센터로 문의해 주세요" 를
   * 내보냈다. **그 뒤가 코드에 없었다** — 문의를 받아도 처리할 길이 없었다.
   *
   * 되돌리는 돈의 길은 이미 나 있다. 적립은 환불이 회수하고(refund-order),
   * 정산은 이미 지급된 것만 빼도록 되어 있다(`deductibleFromSettlement`) —
   * 그 조건이 지금까지 아무것도 고르지 않았던 이유가 바로 이 길이 막혀
   * 있었기 때문이다.
   */
  if (status === 'CONFIRMED' && shippingBorneBy(reason) !== 'SELLER') {
    return {
      ok: false,
      code: 'ALREADY_CONFIRMED',
      message: '구매확정한 주문은 단순 변심으로 반품할 수 없습니다.',
    };
  }

  if (status === 'RETURN_REQUESTED') {
    return { ok: false, code: 'ALREADY_REQUESTED', message: '이미 접수된 신청이 있습니다.' };
  }

  // 출고 전이라면 반품이 아니라 취소다. 반송할 물건이 아직 없다.
  if (status === 'PENDING' || status === 'PAID' || status === 'PREPARING') {
    return {
      ok: false,
      code: 'NOT_SHIPPED',
      message: '아직 출고 전입니다. 주문 취소로 진행해 주세요.',
    };
  }

  if (status !== 'SHIPPED' && status !== 'DELIVERED' && status !== 'CONFIRMED') {
    return { ok: false, code: 'NOT_ELIGIBLE', message: '신청할 수 없는 주문입니다.' };
  }

  /**
   * 기한은 **배송완료일부터** 센다. 배송 중이면 아직 시작되지 않았다 —
   * 받기도 전에 기한이 흐르면 배송이 늦을수록 손해다.
   */
  if (deliveredAt === null) {
    return {
      ok: true,
      deadline: new Date(now.getTime() + returnWindowDays(reason) * DAY_MS),
      borneBy: shippingBorneBy(reason),
    };
  }

  const deadline = new Date(deliveredAt.getTime() + returnWindowDays(reason) * DAY_MS);
  if (now.getTime() > deadline.getTime()) {
    return {
      ok: false,
      code: 'WINDOW_CLOSED',
      message: `${RETURN_REASON_LABEL[reason]} 사유는 배송완료 후 ${returnWindowDays(reason)}일 이내에만 신청할 수 있습니다.`,
    };
  }

  return { ok: true, deadline, borneBy: shippingBorneBy(reason) };
}

/**
 * 화면에 신청 버튼을 띄울 것인가.
 *
 * 사유를 아직 모르는 시점이라 **가장 넉넉한 기한**으로 판단한다. 눌러서
 * 사유를 고르면 그때 정확히 다시 본다. 여기서 좁게 잡으면 하자 신고를
 * 할 수 있는 사람에게 버튼이 안 보인다.
 */
export function canRequestReturn(input: {
  readonly status: OrderStatus;
  readonly deliveredAt: Date | null;
  readonly now: Date;
}): boolean {
  const widest = RETURN_REASON.reduce<ReturnReason>(
    (a, b) => (returnWindowDays(b) > returnWindowDays(a) ? b : a),
    'CHANGED_MIND',
  );
  return checkReturnEligibility({ ...input, reason: widest }).ok;
}
