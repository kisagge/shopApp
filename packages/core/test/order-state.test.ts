import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUS, canTransition, transition, nextStatuses, isTerminal,
  isCancellableByCustomer, holdsInventory, OrderTransitionError, type OrderStatus,
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

  it('구매확정은 종착 상태다', () => {
    expect(isTerminal('CONFIRMED')).toBe(true);
    expect(nextStatuses('CONFIRMED')).toHaveLength(0);
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
