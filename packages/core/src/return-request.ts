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

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETURN_STATUS = ['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED'] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];

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
   * 구매확정하면 끝이다. 적립이 확정되고 정산도 넘어간 뒤라 되돌리려면
   * 돈이 여러 곳에서 역으로 흘러야 한다. 그건 고객센터가 사람 손으로
   * 처리할 일이지 버튼으로 열어 둘 일이 아니다.
   */
  if (status === 'CONFIRMED') {
    return {
      ok: false,
      code: 'ALREADY_CONFIRMED',
      message: '구매확정된 주문입니다. 고객센터로 문의해 주세요.',
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

  if (status !== 'SHIPPED' && status !== 'DELIVERED') {
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
