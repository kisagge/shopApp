/**
 * 메일 문구 템플릿. 순수 로직만.
 *
 * 알림 문구와 같은 선이다 — **말은 운영이, 구조와 값은 코드가.** 고칠 수 있는 것은 메일마다 세 칸: 제목, 머리말(메일
 * 안의 큰 제목), 첫 문장. 주문 상품 표·금액·계좌·버튼·바닥글은 코드가 그린다. 거기까지 문구로 열면 금액 자리를 지우거나
 * 링크를 바꿀 수 있게 되고, 그건 말투가 아니라 거래 내용이다.
 *
 * **인증·비밀번호 재설정 메일은 넣지 않는다.** 보안 안내라서, 운영 실수로 "본인이 요청하지 않았다면 무시하세요" 같은
 * 문장이 사라지면 피싱과 구분할 단서가 없어진다.
 */

export const MAIL_TEMPLATE_KIND = [
  'ORDER_PAID', 'ORDER_PENDING', 'ORDER_DEPOSITED', 'ORDER_SHIPPED', 'ORDER_DELIVERED',
  'RESTOCK', 'INQUIRY_ANSWERED', 'EXCHANGE_SHIPPED',
  'ORDER_CANCELLED', 'RETURN_APPROVED', 'RETURN_REJECTED', 'RETURN_WITHDRAWN', 'REFUND_COMPLETED',
  'POINTS_GRANTED', 'POINTS_DEDUCTED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_RESTORED',
  'COUPON_EXPIRING', 'POINTS_EXPIRING',
] as const;
export type MailTemplateKind = (typeof MAIL_TEMPLATE_KIND)[number];

/**
 * 이 메일이 **마케팅인가, 거래 고지인가.**
 *
 * 마이페이지에는 마케팅 수신 스위치가 있는데 **끄든 켜든 아무것도 달라지지 않았다.** 동의 여부를 판단하는 함수
 * (`marketingOptedIn`)까지 만들어 두고 부르는 곳이 없어서, 꺼 둔 사람에게도 쿠폰·적립금 소멸 안내가 그대로 나갔다.
 * 끈 것이 지켜지지 않으면 손님은 그 스위치를 다시 믿지 않는다.
 *
 * **거래 고지는 끄지 않는다.** 주문·입금·취소·환불·반품 판정·문의 답변·계정 정지는 **손님이 한 일에 대한 답**이고,
 * 안 보내면 손님이 자기 돈과 물건이 어떻게 됐는지 알 길이 없다. 수신 거부는 광고를 거부하는 것이지 거래를 거부하는
 * 것이 아니다.
 *
 * **재입고 알림도 거래 고지다.** 그 옵션에 알려 달라고 직접 신청한 사람에게만 가고, 그 신청 자체가 동의다.
 *
 * 표로 둔 이유는 **메일 종류가 늘 때 고르게 만들기 위해서**다. 목록에서 빠지면 타입이 먼저 막는다.
 */
export type MailConsent = 'marketing' | 'transactional';

export const MAIL_CONSENT: Readonly<Record<MailTemplateKind, MailConsent>> = {
  ORDER_PAID: 'transactional',
  ORDER_PENDING: 'transactional',
  ORDER_DEPOSITED: 'transactional',
  ORDER_SHIPPED: 'transactional',
  ORDER_DELIVERED: 'transactional',
  RESTOCK: 'transactional',
  INQUIRY_ANSWERED: 'transactional',
  EXCHANGE_SHIPPED: 'transactional',
  ORDER_CANCELLED: 'transactional',
  RETURN_APPROVED: 'transactional',
  RETURN_REJECTED: 'transactional',
  RETURN_WITHDRAWN: 'transactional',
  REFUND_COMPLETED: 'transactional',
  POINTS_GRANTED: 'transactional',
  POINTS_DEDUCTED: 'transactional',
  ACCOUNT_SUSPENDED: 'transactional',
  ACCOUNT_RESTORED: 'transactional',
  /*
   * 소멸 안내 둘만 마케팅이다. 손님이 요청한 적 없는 발송이고, 내용도 "혜택이 사라지기 전에 쓰라" 는 권유다 —
   * 쓸지 말지는 손님이 정할 일이고, 그 권유를 받을지도 손님이 정한다.
   */
  COUPON_EXPIRING: 'marketing',
  POINTS_EXPIRING: 'marketing',
};

/** 이 메일을 보내려면 마케팅 수신 동의가 있어야 하는가 */
export function needsMarketingConsent(kind: MailTemplateKind): boolean {
  return MAIL_CONSENT[kind] === 'marketing';
}

/**
 * 이 사람에게 이 메일을 보내도 되는가.
 *
 * 거래 고지는 동의와 무관하게 보낸다. 마케팅은 동의한 사람에게만.
 */
export function mayMail(
  kind: MailTemplateKind,
  consent: { readonly marketingAgreedAt: Date | null },
): boolean {
  return !needsMarketingConsent(kind) || consent.marketingAgreedAt !== null;
}

export const MAIL_TEMPLATE_FIELD = ['subject', 'heading', 'lead'] as const;
export type MailTemplateField = (typeof MAIL_TEMPLATE_FIELD)[number];

/** 칸마다 상한. 제목은 받은편지함 한 줄, 머리말은 짧게, 첫 문장은 두세 줄 */
export const MAIL_TEMPLATE_MAX: Readonly<Record<MailTemplateField, number>> = { subject: 120, heading: 60, lead: 400 };

/**
 * 메일마다 칸별로 끼울 수 있는 값 — 메일을 만드는 코드가 넘기는 것과 같아야 한다(검사가 맞춘다).
 */
export const MAIL_TEMPLATE_PARAMS = {
  ORDER_PAID: { subject: ['orderNo'], heading: [], lead: ['name'] },
  ORDER_PENDING: { subject: ['orderNo'], heading: [], lead: ['name'] },
  ORDER_DEPOSITED: { subject: ['orderNo'], heading: [], lead: [] },
  ORDER_SHIPPED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  ORDER_DELIVERED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  RESTOCK: { subject: ['item'], heading: [], lead: ['item'] },
  INQUIRY_ANSWERED: { subject: ['about'], heading: [], lead: ['about'] },
  EXCHANGE_SHIPPED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  ORDER_CANCELLED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  RETURN_APPROVED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  RETURN_REJECTED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  RETURN_WITHDRAWN: { subject: ['orderNo'], heading: [], lead: ['name'] },
  REFUND_COMPLETED: { subject: ['orderNo'], heading: [], lead: ['name'] },
  POINTS_GRANTED: { subject: ['points'], heading: [], lead: ['name', 'points'] },
  POINTS_DEDUCTED: { subject: ['points'], heading: [], lead: ['name', 'points'] },
  ACCOUNT_SUSPENDED: { subject: [], heading: [], lead: ['name'] },
  ACCOUNT_RESTORED: { subject: [], heading: [], lead: ['name'] },
  COUPON_EXPIRING: { subject: ['count'], heading: [], lead: ['name', 'count', 'date'] },
  POINTS_EXPIRING: { subject: ['points'], heading: [], lead: ['name', 'points', 'date'] },
} as const satisfies Record<MailTemplateKind, Record<MailTemplateField, readonly string[]>>;

/** 미리보기에 끼울 예시 값 */
export const MAIL_SAMPLE_PARAMS: Readonly<Record<string, string>> = {
  orderNo: '20260915-1234567',
  name: '홍길동',
  item: '울 코트 (오트 / M)',
  about: '울 코트',
  points: '3,000',
  count: '2',
  date: '2026-09-22',
};

export const isMailTemplateKind = (value: unknown): value is MailTemplateKind =>
  typeof value === 'string' && (MAIL_TEMPLATE_KIND as readonly string[]).includes(value);
