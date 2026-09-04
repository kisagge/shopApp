import { dayWindow } from './event-rollup';

/**
 * 어드민 주문 검색 정책.
 *
 * 화면에는 검색창이 하나뿐이다. 운영자가 문의를 받았을 때 손에 쥔 것은
 * **주문번호이거나 이름**이지, 둘 중 무엇인지 고르라고 물을 일이 아니다.
 * 어느 쪽인지는 값의 모양을 보고 여기서 판단한다.
 */

/** "20260831-8842713" — 시드와 주문 생성이 만드는 모양 */
const ORDER_NO = /^\d{8}-\d{7}$/;

export type OrderSearchKind = 'orderNo' | 'orderNoPartial' | 'buyer' | 'none';

export interface OrderSearchTerm {
  readonly kind: OrderSearchKind;
  /** 정규화된 검색어. kind 가 none 이면 빈 문자열 */
  readonly value: string;
}

/**
 * 검색어를 읽는다.
 *
 * **완전한 주문번호는 정확히 일치로 찾는다.** orderNo 에 유니크 인덱스가
 * 있어서 부분 일치로 던지면 그 인덱스를 못 쓰고 전체를 훑는다. 운영자가
 * 번호를 통째로 붙여넣는 경우가 대부분이라 이 갈래가 실제로 가장 많이 탄다.
 *
 * 숫자와 하이픈만으로 된 짧은 값은 번호의 일부로 본다 — 전화로 뒷자리만
 * 받아 적는 일이 흔하다.
 */
export function readOrderSearch(raw: string | undefined): OrderSearchTerm {
  const value = (raw ?? '').trim();
  if (value.length === 0) return { kind: 'none', value: '' };

  if (ORDER_NO.test(value)) return { kind: 'orderNo', value };
  if (/^[\d-]{4,}$/.test(value)) return { kind: 'orderNoPartial', value };

  /**
   * 나머지는 이름으로 본다.
   *
   * 목록의 이름은 가려져 있지만(김**) 검색은 원본을 본다. 가리는 것은
   * **훑어보다 남의 정보가 눈에 들어오는 것**을 막기 위한 것이지, 이미
   * 이름을 알고 찾아온 운영자를 막으려는 것이 아니다.
   */
  return { kind: 'buyer', value };
}

export interface DateRange {
  /** 포함 */
  readonly from: Date | null;
  /** **포함하지 않는다** — 그날 24:00 KST */
  readonly until: Date | null;
}

export class OrderSearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderSearchError';
  }
}

/**
 * 'YYYY-MM-DD' 두 개를 조회 구간으로 바꾼다.
 *
 * **끝날을 포함한다.** 사용자가 9월 4일까지라고 적었으면 9월 4일에 들어온
 * 주문이 나와야 한다. 받은 값을 그대로 상한으로 쓰면 그날 00:00 이후가
 * 통째로 빠지는데, 하루치가 조용히 사라지는 것이라 아무도 알아채지 못한다.
 *
 * 경계는 KST 다. 이 저장소의 다른 날짜 집계와 같은 기준을 쓴다 —
 * UTC 로 자르면 오전 9시 이전 주문이 전날로 밀린다.
 */
export function readDateRange(
  from: string | undefined,
  to: string | undefined,
): DateRange {
  const start = from ? boundary(from) : null;
  const end = to ? boundary(to) : null;

  if (start && end && start.start > end.start) {
    throw new OrderSearchError('시작일이 종료일보다 뒤입니다.');
  }

  return {
    from: start?.start ?? null,
    until: end?.end ?? null,
  };
}

function boundary(day: string): { start: Date; end: Date } {
  try {
    const window = dayWindow(day);
    return { start: window.start, end: window.end };
  } catch {
    throw new OrderSearchError(`날짜를 읽을 수 없습니다: ${day}`);
  }
}
