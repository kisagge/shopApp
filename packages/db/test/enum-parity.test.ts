import { describe, it, expect } from 'vitest';
import {
  ORDER_STATUS, ORDER_STATUS_LABEL, USER_ROLE, USER_ROLE_LABEL,
  PAYMENT_STATUS_CODE, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_CODE,
} from '@shop/core';
import { OrderStatus, UserRole, PaymentStatus, PaymentMethod } from '../src/generated/enums';

/**
 * DB의 enum 과 도메인 로직의 상수가 어긋나면 규칙이 DB 에 반영되지 않는다.
 * 한쪽에만 값을 추가하는 실수를 여기서 잡는다.
 */
describe('OrderStatus 정합성', () => {
  it('Prisma enum 과 core 의 ORDER_STATUS 가 같은 집합이다', () => {
    expect(Object.values(OrderStatus).toSorted()).toEqual([...ORDER_STATUS].toSorted());
  });

  it('모든 상태에 한글 라벨이 있다 — 어드민·마이페이지가 이 라벨을 쓴다', () => {
    for (const s of Object.values(OrderStatus)) expect(ORDER_STATUS_LABEL[s]).toBeTruthy();
  });
});

describe('UserRole 정합성', () => {
  it('Prisma enum 과 core 의 USER_ROLE 이 같은 집합이다', () => {
    expect(Object.values(UserRole).toSorted()).toEqual([...USER_ROLE].toSorted());
  });

  it('모든 역할에 한글 라벨이 있다', () => {
    for (const r of Object.values(UserRole)) expect(USER_ROLE_LABEL[r]).toBeTruthy();
  });
});

describe('결제 enum 정합성', () => {
  it('PaymentStatus 가 core 와 같은 집합이다 — 토스 상태값을 그대로 쓴다', () => {
    expect(Object.values(PaymentStatus).toSorted()).toEqual([...PAYMENT_STATUS_CODE].toSorted());
  });

  it('PaymentMethod 가 core 와 같은 집합이다', () => {
    expect(Object.values(PaymentMethod).toSorted()).toEqual([...PAYMENT_METHOD_CODE].toSorted());
  });

  it('모든 결제 상태에 한글 라벨이 있다', () => {
    for (const s of Object.values(PaymentStatus)) expect(PAYMENT_STATUS_LABEL[s]).toBeTruthy();
  });
});
