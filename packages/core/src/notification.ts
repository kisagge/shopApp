/**
 * 알림 규칙. 순수 로직만, I/O 없음.
 *
 * **문구는 여기 없다.** 알림은 나중에 읽는 글이고 그 사이에 사용자가 언어를
 * 바꿀 수 있다 — 만들 때의 말로 굳혀 두면 그때 어긋난다. 무슨 일이 있었는지와
 * 끼울 값만 정하고, 문장은 화면이 만든다.
 */

export const NOTIFICATION_KIND = [
  'ORDER_SHIPPED',
  'ORDER_DELIVERED',
  'INQUIRY_ANSWERED',
  'RESTOCKED',
  /** 운영진이 지급한 쿠폰. 받은 줄 모르면 쿠폰은 없는 것과 같다. */
  'COUPON_ISSUED',
  /**
   * 가맹점 상품의 옵션 재고가 기준 아래로 내려갔다.
   *
   * 대시보드에도 "재고 부족" 이 뜨지만 **열어야 안다.** 품절은 곧바로 매출
   * 손실이고, 재입고에는 며칠이 걸린다 — 알아채는 시점이 늦을수록 비는 날이 길다.
   */
  'STOCK_LOW',
  /**
   * 올린 상품이 매대에 올라갔다 / 되돌아왔다.
   *
   * **되돌릴 때 사유는 이미 받고 있었다.** reviewProduct 는 사유 없는 반려를
   * 막고(REJECT_REASON_REQUIRED) 그 글을 상품 행에 적어 두는데, 적어 두기만
   * 했다 — 가맹점은 자기 상품을 다시 열어 봐야 그것을 본다. 검수는 며칠 걸리는
   * 일이라 다시 열어 볼 이유가 없고, 그래서 사유를 쓴 뜻("무엇을 고쳐야 할지
   * 알려 준다")이 닿지 않았다. 사유를 알림에 실어 보낸다.
   */
  'PRODUCT_APPROVED',
  'PRODUCT_REJECTED',
  /**
   * 입점 신청이 승인됐다 / 반려됐다.
   *
   * **사유는 진작 받고 있었는데 감사 로그에만 남았다.** 상태를 바꾸는 계약은 승인이
   * 아닌 처분에 사유를 강제하는데(불이익을 주는 처분에는 이유를 남긴다), 그 글이
   * 신청한 사람에게는 한 번도 가지 않았다. 승인도 마찬가지다 — 계정과 브랜드까지
   * 만들어 놓고 아무 말도 안 해서, 신청자는 로그인해 보고서야 알았다.
   *
   * **매장 알림함으로 간다.** 반려된 사람에게는 운영 화면이 아예 없고, 승인된
   * 사람도 신청은 매장에서 했다 — 결과를 보러 갈 자리가 거기다.
   */
  'MERCHANT_APPROVED',
  'MERCHANT_REJECTED',
  /** 내 리뷰에 판매자가 답했다. 답은 늦게 달리는 일이 많아, 알리지 않으면 쓴 사람은 다시 와서 볼 일이 없다 */
  'REVIEW_REPLIED',
  /**
   * 교환한 상품을 보냈다. 손님은 신청한 뒤 승인·회수·발송을 기다리는데, 알리지 않으면 주문 화면을 다시 열어 봐야
   * 교환이 끝났는지 안다 — 그 사이 송장이 움직여도 모른다.
   */
  'EXCHANGE_SHIPPED',
  /** 주문(의 일부)이 취소됐다 — 운영진·배치가 했을 때. 돈이 돌아가는 일이다 */
  'ORDER_CANCELLED',
  /** 반품·교환 신청이 승인됐다 — 이제 물건을 보내면 된다 */
  'RETURN_APPROVED',
  /** 반품·교환 신청이 반려됐다 — 사유는 주문 화면에 */
  'RETURN_REJECTED',
  /** 환불이 끝났다 */
  'REFUND_COMPLETED',
  /** 운영진이 적립금을 줬다 / 뺐다 — 잔액이 왜 바뀌었는지 */
  'POINTS_GRANTED',
  'POINTS_DEDUCTED',
  /** 이용 정지가 풀렸다. 정지 자체는 알림함에 남기지 않는다(core account-notice) */
  'ACCOUNT_RESTORED',
  /** 쿠폰·적립금이 한 주 안에 사라진다 — 들어와야 보이는 것을 미리 알린다 */
  'COUPON_EXPIRING',
  'POINTS_EXPIRING',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KIND)[number];

/**
 * **어느 화면의 알림함에 뜨는가.**
 *
 * 가맹점 계정도 사용자라 매장에 로그인할 수 있다. 가르지 않으면 매장 머리의
 * 알림 뱃지에 "재고 부족" 이 뜨는데, 그건 **손님으로 온 자리에서 들을 말이
 * 아니다.** 반대로 운영 알림함에 "배송이 시작됐습니다" 가 뜨면 그 사람이
 * 무엇을 해야 하는지 알 수 없다.
 *
 * 둘은 겹치지 않고, 합치면 전체와 같아야 한다 — 검사가 지킨다.
 */
export const CONSOLE_NOTIFICATION_KIND = [
  'STOCK_LOW',
  // 검수 결과는 상품을 올린 사람이 들을 말이다 — 손님으로 온 자리에 뜰 것이 아니다
  'PRODUCT_APPROVED',
  'PRODUCT_REJECTED',
] as const satisfies readonly NotificationKind[];
export const CUSTOMER_NOTIFICATION_KIND = NOTIFICATION_KIND.filter(
  (kind): kind is Exclude<NotificationKind, (typeof CONSOLE_NOTIFICATION_KIND)[number]> =>
    !(CONSOLE_NOTIFICATION_KIND as readonly string[]).includes(kind),
);

/**
 * 재고 부족 기준. **이 이하면 부족이다.**
 *
 * 한동안 5 가 세 곳에 따로 박혀 있었다 — 상품 화면의 "N개 남음", 대시보드의
 * 재고 부족 수, 운영 상품 목록의 경고색. 알림까지 넷째로 박으면 기준을 바꿀 때
 * 반드시 갈린다: 화면은 7개부터 경고하는데 알림은 5개에서 온다.
 */
export const LOW_STOCK_THRESHOLD = 5;

/**
 * 이번 주문으로 **기준을 넘어 내려갔는가.**
 *
 * 넘는 순간 한 번만 알린다. "기준 이하면 알림" 으로 하면 6→5 에서 한 번,
 * 5→4 에서 또 한 번, 품절까지 **주문마다** 알림이 쌓인다 — 다섯 통째에는
 * 아무도 안 읽는다.
 *
 * 품절(0)도 따로 알리지 않는다. 기준을 넘을 때 이미 알렸고, 그 뒤로는
 * 대시보드가 보여 준다.
 */
export function crossedLowStock(
  before: number,
  after: number,
  threshold: number = LOW_STOCK_THRESHOLD,
): boolean {
  return before > threshold && after <= threshold;
}

export const isNotificationKind = (value: unknown): value is NotificationKind =>
  typeof value === 'string' && (NOTIFICATION_KIND as readonly string[]).includes(value);

/**
 * 머리에 띄울 개수의 상한.
 *
 * 안 읽은 것이 쌓이면 "99+" 로 접는다. 세 자리 숫자가 뱃지에 들어가면 글자가
 * 깨지고, 그보다 **정확한 개수가 더 이상 정보가 아니다** — 200개든 300개든
 * 사용자가 할 일은 같다.
 */
export const UNREAD_BADGE_MAX = 99;

export const formatUnread = (count: number): string =>
  count > UNREAD_BADGE_MAX ? `${UNREAD_BADGE_MAX}+` : String(count);

/**
 * 목록에 담아 둘 기간.
 *
 * 지난 알림을 영영 쌓아 두면 표가 계속 크고, 오래된 것은 아무도 열지 않는다.
 * 이 기간이 지난 것은 배치가 지운다.
 */
export const NOTIFICATION_RETENTION_DAYS = 90;

/** 이 시각보다 오래된 알림은 지워도 된다 */
export function notificationCutoff(now: Date, days = NOTIFICATION_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 알림 한 줄에 실을 사유의 길이.
 *
 * **반려 사유는 500자까지 받는다.** 그 길이를 알림 한 줄에 그대로 실으면 목록이
 * 한 건으로 가득 찬다. 알림이 하는 일은 "무슨 일이 있었는지" 를 스치며 알리는
 * 것이고, 전문은 상품 화면에 있다 — 눌러서 간다.
 */
export const NOTICE_REASON_MAX = 80;

/**
 * 사유를 알림에 실을 수 있게 줄인다.
 *
 * **줄였다는 것을 보이게 한다.** 그냥 자르면 문장이 끝난 줄 알고, 뒤에 붙은
 * 조건을 못 보고 같은 실수를 되풀이한다. 줄 바꿈도 한 칸으로 만든다 — 목록의
 * 한 줄에 들어가야 한다.
 */
export function shortenReason(reason: string, max = NOTICE_REASON_MAX): string {
  const flat = reason.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
