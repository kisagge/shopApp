import { describe, it, expect } from 'vitest';
import {
  orderFilterStatuses, ORDER_FILTER_GROUP, ORDER_FILTER_TAB,
  ORDER_STATUS, canTransition, transition, nextStatuses, isTerminal,
  isCancellableByCustomer, holdsInventory, slowestFulfillmentStatus, OrderTransitionError, type OrderStatus,
  statusBeforeReturn, isRepayable, canRegisterShipment,
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

/**
 * 반품을 반려하면 **왔던 자리로** 되돌아가야 한다.
 *
 * 예전에는 무조건 배송중이었다. 반품이 배송중·배송완료에서만 올 수 있어서
 * 그래도 됐는데, 구매확정에서도 올 수 있게 되면서 깨졌다.
 */
describe('반품을 반려했을 때 돌아갈 자리', () => {
  const at = new Date('2026-09-01T00:00:00Z');

  it('확정까지 갔던 주문은 확정으로 돌아간다', () => {
    expect(statusBeforeReturn({ confirmedAt: at, deliveredAt: at })).toBe('CONFIRMED');
  });

  it('배송완료까지 갔던 주문은 배송완료로 돌아간다', () => {
    expect(statusBeforeReturn({ confirmedAt: null, deliveredAt: at })).toBe('DELIVERED');
  });

  it('배송 중이었으면 배송중으로 돌아간다', () => {
    expect(statusBeforeReturn({ confirmedAt: null, deliveredAt: null })).toBe('SHIPPED');
  });

  it('돌아갈 자리는 전부 실제로 갈 수 있는 곳이다 — 상태머신이 막으면 반려가 터진다', () => {
    for (const order of [
      { confirmedAt: at, deliveredAt: at },
      { confirmedAt: null, deliveredAt: at },
      { confirmedAt: null, deliveredAt: null },
    ]) {
      expect(canTransition('RETURN_REQUESTED', statusBeforeReturn(order))).toBe(true);
    }
  });

  /** 틀리려면 덜 나아간 쪽으로 틀려야 한다 — 확정한 적 없는 주문을 확정으로 되돌리면 안 된다 */
  it('시각이 아예 없으면 확정으로 보지 않는다', () => {
    expect(statusBeforeReturn({ confirmedAt: undefined, deliveredAt: undefined })).toBe('SHIPPED');
    expect(statusBeforeReturn({ confirmedAt: undefined, deliveredAt: at })).toBe('DELIVERED');
  });

  /**
   * 확정 시각은 정산 매출의 축이다. 배송중으로 되돌리면 다시 확정될 때 그
   * 값이 덮이고, 이미 지급한 달의 매출이 다른 달로 옮겨간다.
   */
  it('확정됐던 주문을 배송중으로 되돌리지 않는다', () => {
    expect(statusBeforeReturn({ confirmedAt: at, deliveredAt: at })).not.toBe('SHIPPED');
  });
});

/**
 * 결제를 다시 걸 수 있는 주문인가.
 *
 * 배포에서 승인이 500 으로 실패하자 주문 20260910-7063897 이 PENDING 으로
 * 갇혔다. 화면은 "주문 내역에서 다시 시도할 수 있습니다" 라고 말했는데
 * 그 화면에는 취소 단추밖에 없었다.
 */
describe('다시 결제할 수 있는가', () => {
  it('승인이 안 된 결제대기 주문은 다시 걸 수 있다', () => {
    expect(isRepayable('PENDING', 'READY')).toBe(true);
  });

  it('결제 행이 아직 없어도 다시 걸 수 있다', () => {
    expect(isRepayable('PENDING', null)).toBe(true);
  });

  it.each(['ABORTED', 'FAILED'] as const)('%s 도 다시 걸 수 있다', (s) => {
    expect(isRepayable('PENDING', s)).toBe(true);
  });

  /**
   * **여기가 이 함수의 요점이다.** PENDING 하나로 판단하면 가상계좌 주문에도
   * "다시 결제하기" 가 붙는다. 누르면 이미 받은 계좌를 버리고 새로 발급하게
   * 되고, 그 사이 옛 계좌로 넣은 돈은 갈 곳이 없어진다.
   */
  it('입금을 기다리는 가상계좌 주문은 다시 걸 수 없다', () => {
    expect(isRepayable('PENDING', 'WAITING_FOR_DEPOSIT')).toBe(false);
  });

  it.each(['PAID', 'PREPARING', 'SHIPPED', 'CANCELLED', 'REFUNDED'] as const)(
    '%s 주문에는 붙지 않는다',
    (status) => {
      expect(isRepayable(status, 'DONE')).toBe(false);
    },
  );
});

/**
 * 송장을 붙일 수 있는 주문인가.
 *
 * 붙이는 코드가 상태를 안 보고 먼저 저장한 탓에, 취소·환불된 주문에도 송장이
 * 붙었다. 고객 화면은 송장이 있으면 운송 조회를 그리므로 취소한 주문에 배송
 * 조회가 떴다.
 */
describe('송장을 붙일 수 있는가', () => {
  it('배송준비면 붙일 수 있다 — 여기서 배송중으로 간다', () => {
    expect(canRegisterShipment('PREPARING')).toBe(true);
  });

  it.each(['SHIPPED', 'DELIVERED', 'CONFIRMED'] as const)(
    '%s 는 이미 보낸 것이라 고칠 수 있다',
    (status) => {
      expect(canRegisterShipment(status)).toBe(true);
    },
  );

  /**
   * **결제완료에서 배송중으로 가는 길은 없다.** 배송준비를 거쳐야 한다.
   * 그런데 화면에는 "송장 등록하고 배송 시작" 이 떠 있었고, 누르면 송장만
   * 쓰이고 상태는 결제완료 그대로였다.
   */
  it.each(['PENDING', 'PAID'] as const)('%s 는 아직 보낼 수 없다', (status) => {
    expect(canRegisterShipment(status)).toBe(false);
  });

  it.each(['CANCELLED', 'REFUNDED', 'RETURNED'] as const)(
    '%s 는 붙일 수 없다 — 보낼 물건이 없다',
    (status) => {
      expect(canRegisterShipment(status)).toBe(false);
    },
  );

  /**
   * **전이표만 보면 열린다.** 반품접수에서 배송중으로 가는 길이 표에 있기
   * 때문인데, 그 길은 **반품을 반려할 때** 왔던 자리로 되돌리는 용도다.
   * 송장 등록이 그 뒷문이 되면 반려 사유도 없이 상태만 돌아간다.
   */
  it('반품접수는 전이표에 길이 있어도 붙일 수 없다', () => {
    expect(canTransition('RETURN_REQUESTED', 'SHIPPED')).toBe(true);
    expect(canRegisterShipment('RETURN_REQUESTED')).toBe(false);
  });
});
