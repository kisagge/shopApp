/**
 * 원화는 소수점이 없다. 금액을 number로 굴리다 보면 부동소수점 오차가
 * 결제 금액에 그대로 새어 나가므로, 정수 원 단위만 허용하는 브랜드 타입으로 막는다.
 */
export type Won = number & { readonly __won: unique symbol };

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function won(value: number): Won {
  if (!Number.isFinite(value)) throw new MoneyError(`금액이 유한한 수가 아닙니다: ${value}`);
  if (!Number.isInteger(value)) throw new MoneyError(`원화는 정수여야 합니다: ${value}`);
  if (!Number.isSafeInteger(value)) throw new MoneyError(`금액이 안전 정수 범위를 벗어났습니다: ${value}`);
  return value as Won;
}

export const ZERO: Won = won(0);

export const add = (...amounts: readonly Won[]): Won =>
  won(amounts.reduce<number>((sum, a) => sum + a, 0));

/** 0 아래로는 내려가지 않는 뺄셈. 할인이 금액을 초과할 때 쓴다. */
export const subtractToZero = (a: Won, b: Won): Won => won(Math.max(0, a - b));

export const multiply = (a: Won, quantity: number): Won => {
  if (!Number.isInteger(quantity) || quantity < 0) {
    throw new MoneyError(`수량은 0 이상의 정수여야 합니다: ${quantity}`);
  }
  return won(a * quantity);
};

export const min = (a: Won, b: Won): Won => (a <= b ? a : b);
export const gte = (a: Won, b: Won): boolean => a >= b;

/**
 * 정률 할인. 원 단위 미만은 버린다(고객에게 유리하지 않은 쪽으로 반올림하지 않기 위해
 * 할인액을 내림하는 게 아니라, 할인액을 내림해 판매자 손실을 막는 관행을 따른다).
 */
export function percentOf(amount: Won, percent: number): Won {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new MoneyError(`할인율은 0~100 사이여야 합니다: ${percent}`);
  }
  return won(Math.floor((amount * percent) / 100));
}

/**
 * 표시용 할인율.
 *
 * **판매가가 진실이고 할인율은 거기서 나온다.** 반대로 하면 안 된다.
 * 국내 커머스는 289,000원처럼 딱 떨어지는 판매가를 정하고 할인율을 붙인다.
 * 할인율(30%)을 저장해 판매가를 계산하면 413,000 × 0.7 = 289,100 이 되고,
 * 아무도 그런 가격표를 붙이지 않는다.
 *
 * 내림한다. 29.98% 를 30% 로 반올림해 표시하면 과장 광고가 된다.
 */
export function discountRateOf(listPrice: Won, salePrice: Won): number {
  if (listPrice <= 0 || salePrice >= listPrice) return 0;
  return Math.floor(((listPrice - salePrice) / listPrice) * 100);
}

const KRW = new Intl.NumberFormat('ko-KR');

/** 표시용. "289,000" — 단위는 UI가 붙인다. */
export const format = (amount: Won): string => KRW.format(amount);

/** 표시용. "289,000원" */
export const formatWithUnit = (amount: Won): string => `${KRW.format(amount)}원`;
