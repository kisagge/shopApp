import { describe, it, expect } from 'vitest';
import { ORDER_STATUS, ORDER_STATUS_LABEL } from '@shop/core';
import { OrderStatus } from '../src/generated/enums';

/**
 * DB의 주문 상태와 도메인 로직의 주문 상태가 어긋나면,
 * 상태 전이 규칙(packages/core)이 DB에 반영되지 않는다.
 * 한쪽에만 값을 추가하는 실수를 여기서 잡는다.
 */
describe('OrderStatus 정합성', () => {
  const prismaValues = Object.values(OrderStatus).toSorted();
  const coreValues = [...ORDER_STATUS].toSorted();

  it('Prisma enum 과 core 의 ORDER_STATUS 가 같은 집합이다', () => {
    expect(prismaValues).toEqual(coreValues);
  });

  it('모든 상태에 한글 라벨이 있다 — 어드민·마이페이지가 이 라벨을 쓴다', () => {
    for (const status of Object.values(OrderStatus)) {
      expect(ORDER_STATUS_LABEL[status], `${status} 라벨 없음`).toBeTruthy();
    }
  });
});
