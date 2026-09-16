import { describe, it, expect } from 'vitest';
import {
  NOTIFICATION_KIND, CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND,
  LOW_STOCK_THRESHOLD, crossedLowStock, stockLevel, STOCK_LEVEL_RANGE,
} from '../src/notification';

/**
 * 재고 부족 알림의 규칙.
 */

describe('기준을 넘는 순간', () => {
  it('넘어 내려가는 순간 한 번만 알린다', () => {
    /*
     * **여기가 이 묶음의 요점이다.** "기준 이하면 알림" 으로 하면 6→5 에서 한 번,
     * 5→4 에서 또 한 번, 품절까지 **주문마다** 알림이 쌓인다. 다섯 통째에는
     * 아무도 안 읽고, 그러면 알림함 전체가 무시된다.
     */
    expect(crossedLowStock(6, 5), '6→5 는 넘은 것이다').toBe(true);
    expect(crossedLowStock(5, 4), '이미 기준 아래였다').toBe(false);
    expect(crossedLowStock(4, 0), '품절도 이미 알린 뒤다').toBe(false);
  });

  it('한 번에 크게 빠져도 넘은 것이다', () => {
    // 한 사람이 열 벌을 사면 20→10 이 아니라 12→2 처럼 기준을 건너뛴다
    expect(crossedLowStock(12, 2)).toBe(true);
    expect(crossedLowStock(12, 0)).toBe(true);
  });

  it('기준 위에서 움직이면 조용하다', () => {
    expect(crossedLowStock(20, 6)).toBe(false);
  });

  it('늘어나는 것은 넘는 것이 아니다', () => {
    // 취소로 재고가 돌아올 때 알림이 가면 거꾸로 된 소식이다
    expect(crossedLowStock(4, 8)).toBe(false);
  });

  it('기준값은 한 곳에서 온다', () => {
    /*
     * 한동안 5 가 세 곳에 따로 박혀 있었다 — 상품 화면·대시보드·운영 상품 목록.
     * 알림까지 넷째로 박으면 기준을 바꿀 때 반드시 갈린다.
     */
    expect(crossedLowStock(LOW_STOCK_THRESHOLD + 1, LOW_STOCK_THRESHOLD)).toBe(true);
    expect(crossedLowStock(LOW_STOCK_THRESHOLD, LOW_STOCK_THRESHOLD - 1)).toBe(false);
  });
});

describe('어느 알림함에 뜨는가', () => {
  it('매장과 운영 알림함은 겹치지 않는다', () => {
    /*
     * 겹치면 가맹점 계정이 매장에 들어왔을 때 머리의 뱃지에 "재고 부족" 이 뜬다 —
     * 손님으로 온 자리에서 들을 말이 아니다.
     */
    const console = new Set<string>(CONSOLE_NOTIFICATION_KIND);
    expect(CUSTOMER_NOTIFICATION_KIND.filter((k) => console.has(k))).toEqual([]);
  });

  it('둘을 합치면 전체와 같다 — 어느 알림함에도 안 뜨는 종류가 없다', () => {
    /*
     * **종류를 새로 더하면서 어느 쪽에도 안 넣으면 그 알림은 영영 안 보인다.**
     * 쌓이기는 하는데 아무 화면도 안 읽는다 — 가장 알아채기 어려운 고장이다.
     */
    expect(new Set([...CUSTOMER_NOTIFICATION_KIND, ...CONSOLE_NOTIFICATION_KIND])).toEqual(
      new Set(NOTIFICATION_KIND),
    );
  });

  it('재고 부족은 운영 알림함의 것이다', () => {
    expect(CONSOLE_NOTIFICATION_KIND).toContain('STOCK_LOW');
    expect(CUSTOMER_NOTIFICATION_KIND as readonly string[]).not.toContain('STOCK_LOW');
  });
});

describe('재고 칸 — 품절 / 임박 / 넉넉', () => {
  it('0 이하는 품절이다', () => {
    expect(stockLevel(0)).toBe('OUT');
    // 음수는 생기면 안 되지만, 생겼다면 팔 수 있는 것으로 읽지 않는다
    expect(stockLevel(-1)).toBe('OUT');
  });

  it('1 부터 기준까지가 임박이다 — 품절은 임박이 아니다', () => {
    /*
     * 대시보드는 한동안 `재고 ≤ 5` 로 "품절 임박" 을 셌고 목록은 `0 < 재고 ≤ 5` 로
     * "임박" 을 붙였다. 같은 이름으로 다른 수를 말했다.
     */
    expect(stockLevel(1)).toBe('LOW');
    expect(stockLevel(LOW_STOCK_THRESHOLD)).toBe('LOW');
  });

  it('기준을 넘으면 넉넉하다', () => {
    expect(stockLevel(LOW_STOCK_THRESHOLD + 1)).toBe('OK');
  });

  it('조회 범위가 판정과 같은 경계다 — 대시보드 숫자와 도착한 목록이 맞는다', () => {
    /*
     * 판정은 화면이, 범위는 조회가 쓴다. 둘 중 하나만 고치면 숫자는 12 인데 눌러서
     * 들어간 목록은 10 줄이 된다. 경계 부근의 값을 둘 다에 넣어 본다.
     */
    const inRange = (range: { gt?: number; lte: number }, n: number) =>
      (range.gt === undefined || n > range.gt) && n <= range.lte;

    for (let n = -1; n <= LOW_STOCK_THRESHOLD + 2; n += 1) {
      expect(inRange(STOCK_LEVEL_RANGE.OUT, n), `OUT ${n}`).toBe(stockLevel(n) === 'OUT');
      expect(inRange(STOCK_LEVEL_RANGE.LOW, n), `LOW ${n}`).toBe(stockLevel(n) === 'LOW');
    }
  });
});
