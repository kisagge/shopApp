/**
 * 쿠폰 발행 정책.
 *
 * 쓰는 쪽(할인 계산)은 cart.ts 에 있다. 여기는 **만들고 발급하는 쪽**이다.
 * 순수 함수만 둔다. I/O 없음.
 */

export const COUPON_KIND = ['AMOUNT', 'PERCENT'] as const;
export type CouponKind = (typeof COUPON_KIND)[number];

export const COUPON_KIND_LABEL: Readonly<Record<CouponKind, string>> = {
  AMOUNT: '정액 할인',
  PERCENT: '정률 할인',
};

/**
 * 코드에 쓰는 글자.
 *
 * 헷갈리는 글자를 뺐다 — O/0, I/1, L. 쿠폰 코드는 문자메시지나 전단지에서
 * 옮겨 적는 값이라, 한 글자만 잘못 봐도 "그런 쿠폰 없습니다" 가 된다.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const COUPON_CODE_PATTERN = /^[A-Z0-9]{4,20}$/;

/**
 * 사람이 옮겨 적은 코드를 하나로 맞춘다.
 *
 * 소문자로 치거나 하이픈·공백을 넣는 사람이 많다. 저장은 대문자 하나뿐이라
 * 입력을 그대로 대조하면 멀쩡한 코드가 안 맞는다.
 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, '');
}

export function isCouponCodeLike(code: string): boolean {
  return COUPON_CODE_PATTERN.test(normalizeCouponCode(code));
}

/** 무작위 코드. 운영자가 직접 짓지 않을 때 쓴다. */
export function generateCouponCode(length = 8, random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return out;
}

// ── 발행 내용 검증 ────────────────────────────────────────────

export interface CouponDefinition {
  readonly kind: CouponKind;
  readonly value: number;
  readonly percent: number;
  readonly maxDiscount: number | null;
  readonly minimumOrder: number;
  readonly issueLimit: number | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * 발행 내용이 말이 되는가.
 *
 * 칸별로 사유를 돌려준다. "입력이 올바르지 않습니다" 하나로는 운영자가
 * 무엇을 고쳐야 할지 모른다.
 */
export function validateCouponDefinition(
  d: CouponDefinition,
): Readonly<Record<string, string>> {
  const errors: Record<string, string> = {};

  if (d.kind === 'AMOUNT') {
    if (d.value <= 0) errors['value'] = '할인 금액을 입력해 주세요';
    // 정액인데 상한이 있으면 무슨 뜻인지 알 수 없다
    if (d.maxDiscount !== null) errors['maxDiscount'] = '정액 할인에는 상한을 두지 않습니다';
  } else {
    if (d.percent < 1 || d.percent > 100) errors['percent'] = '할인율은 1~100% 사이입니다';
    if (d.maxDiscount !== null && d.maxDiscount <= 0) {
      errors['maxDiscount'] = '상한은 0보다 커야 합니다';
    }
  }

  if (d.minimumOrder < 0) errors['minimumOrder'] = '최소 주문 금액은 0 이상입니다';

  /**
   * 정액 할인이 최소 주문 금액보다 크면 안 된다.
   *
   * 5,000원 이상 주문에 10,000원 할인은 결제 금액이 늘 0원이라는 뜻이다.
   * 실수로 이렇게 내면 그 순간 전 상품이 공짜가 된다.
   */
  if (d.kind === 'AMOUNT' && d.minimumOrder > 0 && d.value > d.minimumOrder) {
    errors['value'] = '할인 금액이 최소 주문 금액보다 큽니다';
  }

  if (d.issueLimit !== null && d.issueLimit < 1) {
    errors['issueLimit'] = '발급 수량은 1 이상이거나 비워 두세요';
  }

  if (d.endsAt.getTime() <= d.startsAt.getTime()) {
    errors['endsAt'] = '종료일이 시작일보다 뒤여야 합니다';
  }

  return errors;
}

// ── 상태 ──────────────────────────────────────────────────────

export const COUPON_STATUS = ['SCHEDULED', 'ACTIVE', 'EXPIRED', 'EXHAUSTED', 'INACTIVE'] as const;
export type CouponStatus = (typeof COUPON_STATUS)[number];

export const COUPON_STATUS_LABEL: Readonly<Record<CouponStatus, string>> = {
  SCHEDULED: '시작 전',
  ACTIVE: '발급 중',
  EXPIRED: '기간 종료',
  EXHAUSTED: '수량 소진',
  INACTIVE: '중지됨',
};

export function couponStatus(
  c: {
    readonly isActive: boolean;
    readonly startsAt: Date;
    readonly endsAt: Date;
    readonly issueLimit: number | null;
    readonly issuedCount: number;
  },
  now: Date,
): CouponStatus {
  // 중지가 가장 세다. 운영자가 손으로 내린 것을 기간이 되살리면 안 된다.
  if (!c.isActive) return 'INACTIVE';
  if (now.getTime() < c.startsAt.getTime()) return 'SCHEDULED';
  if (now.getTime() > c.endsAt.getTime()) return 'EXPIRED';
  if (c.issueLimit !== null && c.issuedCount >= c.issueLimit) return 'EXHAUSTED';
  return 'ACTIVE';
}

/** 지금 더 발급할 수 있는가 */
export const isIssuable = (
  c: Parameters<typeof couponStatus>[0],
  now: Date,
): boolean => couponStatus(c, now) === 'ACTIVE';

/**
 * 할인 내용을 고칠 수 있는가.
 *
 * **한 장이라도 발급됐으면 못 고친다.** 받은 사람은 그때 조건으로 쓸 수
 * 있다고 믿고 있다. 20% 쿠폰을 5% 로 바꾸면 그 약속을 깨는 것이고,
 * 반대로 올리면 예상 못 한 비용이 된다. 고칠 일이 있으면 중지하고 새로
 * 만드는 것이 맞다.
 *
 * 이름과 종료일, 중지 여부는 발급된 뒤에도 손댈 수 있다 — 그건 약속을
 * 바꾸는 것이 아니다(종료일을 **늘리는** 것만 허용한다).
 */
export const canEditDiscount = (issuedCount: number): boolean => issuedCount === 0;
