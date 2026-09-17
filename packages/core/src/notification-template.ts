import type { NotificationKind } from './notification';

/**
 * 알림 문구 템플릿. 순수 로직만.
 *
 * 문구는 운영이 고치고 **끼울 값은 코드가 정한다.** "배송이 시작됐어요 🚚" 로 말투를 바꾸는 것은 배포할 일이 아니다.
 * 반대로 템플릿이 아무 이름이나 부를 수 있으면 `{recipientPhone}` 같은 것을 적어 넣을 수 있게 되는데, 그런 값은
 * 알림에 실려 있지도 않고 실려서도 안 된다. 그래서 종류마다 쓸 수 있는 자리를 여기 못 박는다.
 */

/**
 * 종류마다 알림에 실리는 값 — 알림을 남기는 코드가 넣는 것과 같아야 한다(검사가 소스를 읽어 맞춘다).
 */
export const NOTIFICATION_PARAMS = {
  ORDER_PAID: ['orderNo'],
  ORDER_PENDING: ['orderNo'],
  ORDER_DEPOSITED: ['orderNo'],
  ORDER_SHIPPED: ['orderNo'],
  ORDER_DELIVERED: ['orderNo'],
  INQUIRY_ANSWERED: ['productName'],
  RESTOCKED: ['productName', 'optionLabel'],
  COUPON_ISSUED: ['couponName'],
  STOCK_LOW: ['productName', 'optionLabel', 'stock'],
  PRODUCT_APPROVED: ['productName'],
  /** 사유를 함께 싣는다 — 이것이 없으면 "되돌아왔다" 만 알고 무엇을 고칠지는 모른다 */
  PRODUCT_REJECTED: ['productName', 'reason'],
  MERCHANT_APPROVED: ['merchantName'],
  MERCHANT_REJECTED: ['merchantName', 'reason'],
  REVIEW_REPLIED: ['productName'],
  EXCHANGE_SHIPPED: ['orderNo'],
  ORDER_CANCELLED: ['orderNo'],
  RETURN_APPROVED: ['orderNo'],
  RETURN_REJECTED: ['orderNo'],
  REFUND_COMPLETED: ['orderNo'],
  POINTS_GRANTED: ['points'],
  POINTS_DEDUCTED: ['points'],
  ACCOUNT_RESTORED: [],
  COUPON_EXPIRING: ['count', 'date'],
  POINTS_EXPIRING: ['points', 'date'],
  /** 금액까지 싣는다 — 기간만 알리면 얼마인지 보러 결국 화면을 열게 된다 */
  SETTLEMENT_CLOSED: ['period', 'amount'],
  SETTLEMENT_PAID: ['period', 'amount'],
  RETURN_REQUESTED: ['orderNo'],
  INQUIRY_RECEIVED: ['productName'],
  SUPPORT_INQUIRY_RECEIVED: [],
  MERCHANT_APPLIED: ['merchantName'],
} as const satisfies Record<NotificationKind, readonly string[]>;

/** 미리보기에 끼울 값. 운영자가 고친 문구가 실제로 어떻게 읽히는지 보려고 쓴다 */
export const NOTIFICATION_SAMPLE_PARAMS: Readonly<Record<string, string>> = {
  orderNo: '20260915-1234567',
  productName: '울 코트',
  optionLabel: '오트 / M',
  couponName: '가을 10% 쿠폰',
  stock: '3',
  points: '3,000',
  count: '2',
  date: '2026-09-22',
  reason: '대표 이미지에 다른 브랜드 로고가 보입니다',
  merchantName: '스튜디오 눈',
  period: '2026-08',
  amount: '1,284,000',
};

/** 알림 한 줄의 상한. 머리의 알림 목록과 앱 알림에 한눈에 들어가야 한다 */
export const NOTIFICATION_TEMPLATE_MAX = 200;

export type TemplateProblem =
  | { readonly kind: 'EMPTY' }
  | { readonly kind: 'TOO_LONG'; readonly max: number }
  /** 이 종류의 알림에 실리지 않는 이름. 그대로 두면 `{이름}` 이 글자로 보인다 */
  | { readonly kind: 'UNKNOWN_PLACEHOLDER'; readonly names: readonly string[] }
  /** 짝이 안 맞는 중괄호. `{orderNo` 처럼 닫는 것을 잊은 경우 */
  | { readonly kind: 'BROKEN_BRACE' };

const PLACEHOLDER = /\{(\w+)\}/g;

export function placeholdersOf(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER)].map((m) => m[1]!))];
}

export function checkTemplate(kind: NotificationKind, body: string): TemplateProblem[] {
  return checkTemplateText(body, NOTIFICATION_PARAMS[kind], NOTIFICATION_TEMPLATE_MAX);
}

/**
 * 템플릿 한 칸의 검사 — 비었나, 너무 긴가, 중괄호 짝, 쓸 수 없는 이름. 알림 문구와 메일 문구가 같은 규칙을 쓴다.
 */
export function checkTemplateText(body: string, allowed: readonly string[], max: number): TemplateProblem[] {
  const text = body.trim();
  if (text === '') return [{ kind: 'EMPTY' }];

  const problems: TemplateProblem[] = [];
  if (text.length > max) problems.push({ kind: 'TOO_LONG', max });

  // 올바른 자리를 지우고 나서도 중괄호가 남으면 짝이 안 맞는 것이다
  if (/[{}]/.test(text.replace(PLACEHOLDER, ''))) problems.push({ kind: 'BROKEN_BRACE' });

  const unknown = placeholdersOf(text).filter((name) => !allowed.includes(name));
  if (unknown.length > 0) problems.push({ kind: 'UNKNOWN_PLACEHOLDER', names: unknown });

  return problems;
}

/**
 * 템플릿에 값을 끼운다.
 *
 * **쓰는 자리 하나라도 값이 없으면 null** — 부르는 쪽이 기본 문구로 물러난다. 상품이 지워진 문의 답변처럼 값이 빠진
 * 옛 알림에서 `{productName} 문의에…` 가 글자 그대로 보이면 안 된다. 빈칸으로 채워 " 문의에 답변이…" 로 두는 것도
 * 문장이 깨진다.
 */
export function renderTemplate(body: string, params: Readonly<Record<string, string>>): string | null {
  let missing = false;
  const text = body.replace(PLACEHOLDER, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined || value === '') {
      missing = true;
      return '';
    }
    return value;
  });
  return missing ? null : text;
}
