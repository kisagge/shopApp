/**
 * 고객에게 보여 주는 주문번호. "20260831-8842713"
 *
 * DB 시퀀스를 쓰지 않는 이유가 두 가지다.
 * 1) 연속된 번호는 하루 주문량을 외부에 노출한다 (경쟁사가 세어 볼 수 있다).
 * 2) 나중에 주문 테이블을 샤딩하거나 분리하면 시퀀스가 걸림돌이 된다.
 *
 * 대신 날짜 + 난수 7자리를 쓰고 DB 의 unique 제약으로 충돌을 잡는다.
 * 하루 1000만 조합이라 하루 1만 건이어도 충돌 확률은 0.1% 미만이고,
 * 충돌하면 다시 뽑으면 된다.
 */

const SUFFIX_DIGITS = 7;
const SUFFIX_MAX = 10 ** SUFFIX_DIGITS;

export interface OrderNumberOptions {
  /** 테스트에서 고정하기 위해 주입한다 */
  readonly now?: Date;
  readonly random?: () => number;
}

export function generateOrderNumber(options: OrderNumberOptions = {}): string {
  const now = options.now ?? new Date();
  const random = options.random ?? Math.random;

  // 한국 사용자가 보는 번호라 KST 기준 날짜를 쓴다.
  // UTC 로 찍으면 자정 직후 주문이 전날 날짜를 달게 된다.
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = kst.toISOString().slice(0, 10).replaceAll('-', '');

  const suffix = Math.floor(random() * SUFFIX_MAX)
    .toString()
    .padStart(SUFFIX_DIGITS, '0');

  return `${date}-${suffix}`;
}

const ORDER_NUMBER_RE = /^\d{8}-\d{7}$/;

export const isOrderNumber = (value: string): boolean => ORDER_NUMBER_RE.test(value);
