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
  'ORDER_PAID', 'ORDER_PENDING', 'ORDER_DEPOSITED', 'RESTOCK', 'INQUIRY_ANSWERED', 'EXCHANGE_SHIPPED',
] as const;
export type MailTemplateKind = (typeof MAIL_TEMPLATE_KIND)[number];

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
  RESTOCK: { subject: ['item'], heading: [], lead: ['item'] },
  INQUIRY_ANSWERED: { subject: ['about'], heading: [], lead: ['about'] },
  EXCHANGE_SHIPPED: { subject: ['orderNo'], heading: [], lead: ['name'] },
} as const satisfies Record<MailTemplateKind, Record<MailTemplateField, readonly string[]>>;

/** 미리보기에 끼울 예시 값 */
export const MAIL_SAMPLE_PARAMS: Readonly<Record<string, string>> = {
  orderNo: '20260915-1234567',
  name: '홍길동',
  item: '울 코트 (오트 / M)',
  about: '울 코트',
};

export const isMailTemplateKind = (value: unknown): value is MailTemplateKind =>
  typeof value === 'string' && (MAIL_TEMPLATE_KIND as readonly string[]).includes(value);
