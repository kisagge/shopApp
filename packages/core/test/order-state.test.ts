import { describe, it, expect } from 'vitest';
import {
  orderFilterStatuses, ORDER_FILTER_GROUP, ORDER_FILTER_TAB,
  ORDER_STATUS, canTransition, transition, nextStatuses, isTerminal,
  isCancellableByCustomer, holdsInventory, slowestFulfillmentStatus, OrderTransitionError, type OrderStatus,
} from '../src/order-state';

describe('주문 상태 전이', () => {
  it('정상 배송 흐름을 끝까지 통과한다', () => {
    const flow: OrderStatus[] = ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CONFIRMED'];
    for (let i = 0; i < flow.length - 1; i += 1) {
      expect(canTransition(flow[i]!, flow[i + 1]!)).toBe(true);
    }
  });

  it('단계를 건너뛸 수 없다', () => {
    expect(canTransition('PAID', 'SHIPPED')).toBe(false);
    expect(() => transition('PAID', 'DELIVERED')).toThrow(OrderTransitionError);
  });

  it('출고 후에는 취소할 수 없고 반품으로만 간다', () => {
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransition('SHIPPED', 'RETURN_REQUESTED')).toBe(true);
  });

  /**
   * 확정 뒤에 갈 수 있는 곳은 반품 접수 하나뿐이다. 어떤 사유로 갈 수 있는지는
   * 상태 기계가 아니라 반품 정책이 정한다 — 여기는 길만 낸다.
   */
  it('구매확정 뒤에는 반품 접수로만 갈 수 있다', () => {
    expect(nextStatuses('CONFIRMED')).toEqual(['RETURN_REQUESTED']);
    expect(isTerminal('CONFIRMED')).toBe(false);
  });

  it('반품 접수는 철회해서 배송중으로 되돌릴 수 있다', () => {
    expect(canTransition('RETURN_REQUESTED', 'SHIPPED')).toBe(true);
  });

  it('에러 메시지에 한글 상태명이 들어간다', () => {
    expect(() => transition('CONFIRMED', 'CANCELLED')).toThrow(/구매확정.*주문취소/);
  });

  it('고객 취소는 출고 전까지만 가능하다', () => {
    expect(isCancellableByCustomer('PENDING')).toBe(true);
    expect(isCancellableByCustomer('PAID')).toBe(true);
    expect(isCancellableByCustomer('PREPARING')).toBe(false);
  });

  it('취소·반품·환불 상태는 재고를 붙잡지 않는다', () => {
    expect(holdsInventory('CANCELLED')).toBe(false);
    expect(holdsInventory('RETURNED')).toBe(false);
    expect(holdsInventory('REFUNDED')).toBe(false);
    expect(holdsInventory('PAID')).toBe(true);
  });

  it('모든 상태에 전이 규칙이 정의돼 있다', () => {
    for (const s of ORDER_STATUS) expect(Array.isArray(nextStatuses(s))).toBe(true);
  });
});

describe('slowestFulfillmentStatus — 주문 전체 상태는 가장 뒤처진 줄이 정한다', () => {
  it('줄마다 다르면 가장 뒤처진 것을 고른다', () => {
    // 한 가맹점이 출고했다고 주문 전체가 배송중이 되면,
    // 아직 준비 중인 다른 상품까지 배송중으로 보인다
    expect(slowestFulfillmentStatus(['SHIPPED', 'PREPARING'])).toBe('PREPARING');
    expect(slowestFulfillmentStatus(['DELIVERED', 'PAID', 'SHIPPED'])).toBe('PAID');
  });

  it('전부 같으면 그 상태다', () => {
    expect(slowestFulfillmentStatus(['SHIPPED', 'SHIPPED'])).toBe('SHIPPED');
  });

  it('한 줄이면 그 줄의 상태다', () => {
    expect(slowestFulfillmentStatus(['PREPARING'])).toBe('PREPARING');
  });

  it('이행 경로 밖의 상태가 섞이면 판단하지 않는다', () => {
    // 일부만 취소된 주문의 전체 상태는 별도 정책이 필요하다
    expect(slowestFulfillmentStatus(['SHIPPED', 'CANCELLED'])).toBeNull();
    expect(slowestFulfillmentStatus(['RETURN_REQUESTED'])).toBeNull();
  });

  it('빈 목록이면 null 이다', () => {
    expect(slowestFulfillmentStatus([])).toBeNull();
  });
});

describe('환불로 들어오는 길', () => {
  /**
   * 환불 코드가 "어디서 왔는지" 로 재고 복원을 판단한다.
   *
   * 취소는 그 자리에서 이미 재고를 풀었고 반품은 아무도 풀지 않았기 때문인데,
   * 이 판단은 **REFUNDED 로 들어오는 길이 둘뿐일 때만** 성립한다.
   * 길이 하나 더 생기면 여기서 먼저 깨져야 한다.
   */
  it('취소와 반품완료에서만 온다', () => {
    const incoming = ORDER_STATUS.filter((from) => canTransition(from, 'REFUNDED'));
    expect(incoming).toEqual(['CANCELLED', 'RETURNED']);
  });

  it('환불은 종착이다 — 되돌릴 방법을 두지 않는다', () => {
    expect(isTerminal('REFUNDED')).toBe(true);
  });

  it('구매확정에서 환불로 한 홉에 가지는 않는다 — 물건을 먼저 받아야 한다', () => {
    expect(canTransition('CONFIRMED', 'REFUNDED')).toBe(false);
    // 반품 접수 → 반품 완료 → 환불. 그 길을 지나야 한다.
    expect(canTransition('CONFIRMED', 'RETURN_REQUESTED')).toBe(true);
    expect(canTransition('RETURNED', 'REFUNDED')).toBe(true);
  });
});

describe('주문 내역에서 걸러 볼 칸', () => {
  it('모든 상태가 어느 탭으로든 닿는다', () => {
    /*
     * **여기가 비어 있었다.** 탭이 열 상태 중 다섯만 덮고 있어서 구매확정·
     * 취소·반품·환불은 "전체" 에서만 보였다. 자동 구매확정이 돌면 지난 주문
     * 대부분이 CONFIRMED 가 되므로, 시간이 갈수록 탭이 아무것도 못 걸러 낸다.
     *
     * 화면이 무엇을 그리든, **어느 상태도 갈 곳이 없어서는 안 된다.**
     */
    const covered = new Set<string>();
    for (const tab of ORDER_FILTER_TAB) {
      for (const status of orderFilterStatuses(tab) ?? []) covered.add(status);
    }

    expect(
      ORDER_STATUS.filter((s) => !covered.has(s)),
      '이 상태들은 어느 탭에도 없어 "전체" 에서만 보인다',
    ).toEqual([]);
  });

  it('묶음이 서로 겹치지 않는다', () => {
    // 겹치면 같은 주문이 두 칸에 나오고, 사용자는 왜인지 알 수 없다
    const seen = new Set<string>();
    for (const statuses of Object.values(ORDER_FILTER_GROUP)) {
      for (const s of statuses) {
        expect(seen.has(s), `${s} 가 두 묶음에 있다`).toBe(false);
        seen.add(s);
      }
    }
  });

  it('모르는 값은 거르지 않는 것과 같다', () => {
    // 주소는 사용자가 고칠 수 있다. 오류 화면을 띄울 일이 아니다.
    expect(orderFilterStatuses('엉뚱한값')).toBeNull();
    expect(orderFilterStatuses(undefined)).toBeNull();
  });

  it('하나짜리 상태도 목록으로 돌려준다', () => {
    // 부르는 쪽이 "하나인가 묶음인가" 를 다시 나누지 않게 한다
    expect(orderFilterStatuses('SHIPPED')).toEqual(['SHIPPED']);
  });
});
