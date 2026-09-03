import { describe, it, expect } from 'vitest';
import {
  shippingBorneBy, returnWindowDays, checkReturnEligibility, canRequestReturn,
} from '../src/return-request';

const DAY = 24 * 60 * 60 * 1000;
const delivered = new Date('2026-09-01T10:00:00+09:00');

describe('반송비는 사유가 정한다', () => {
  it('단순 변심은 고객이 낸다', () => {
    expect(shippingBorneBy('CHANGED_MIND')).toBe('CUSTOMER');
  });

  it('불량·오배송·파손은 판매자가 낸다', () => {
    expect(shippingBorneBy('DEFECT')).toBe('SELLER');
    expect(shippingBorneBy('WRONG_ITEM')).toBe('SELLER');
    expect(shippingBorneBy('DAMAGED')).toBe('SELLER');
  });

  it('요청이 아니라 사유에서 나온다', () => {
    // 요청으로 받으면 누구나 SELLER 를 보내 반송비를 넘길 수 있다.
    // 함수가 사유 하나만 받는다는 것이 곧 그 보장이다.
    const r = checkReturnEligibility({
      status: 'DELIVERED', deliveredAt: delivered, reason: 'CHANGED_MIND',
      now: new Date(delivered.getTime() + DAY),
    });
    expect(r.ok && r.borneBy).toBe('CUSTOMER');
  });
});

describe('신청 기한', () => {
  it('단순 변심은 7일', () => {
    expect(returnWindowDays('CHANGED_MIND')).toBe(7);
  });

  it('하자는 30일 — 변심보다 길다', () => {
    expect(returnWindowDays('DEFECT')).toBe(30);
    expect(returnWindowDays('DEFECT')).toBeGreaterThan(returnWindowDays('CHANGED_MIND'));
  });

  it('기한 안이면 통과한다', () => {
    const r = checkReturnEligibility({
      status: 'DELIVERED', deliveredAt: delivered, reason: 'CHANGED_MIND',
      now: new Date(delivered.getTime() + 6 * DAY),
    });
    expect(r.ok).toBe(true);
  });

  it('기한이 지나면 사유와 함께 거절한다', () => {
    const r = checkReturnEligibility({
      status: 'DELIVERED', deliveredAt: delivered, reason: 'CHANGED_MIND',
      now: new Date(delivered.getTime() + 8 * DAY),
    });
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ code: 'WINDOW_CLOSED' });
  });

  it('변심은 지났어도 하자는 아직 신청할 수 있다', () => {
    const now = new Date(delivered.getTime() + 10 * DAY);
    expect(checkReturnEligibility({ status: 'DELIVERED', deliveredAt: delivered, reason: 'CHANGED_MIND', now }).ok)
      .toBe(false);
    expect(checkReturnEligibility({ status: 'DELIVERED', deliveredAt: delivered, reason: 'DEFECT', now }).ok)
      .toBe(true);
  });

  it('배송 중이면 기한이 아직 시작되지 않았다 — 받기 전에 흐르면 배송이 늦을수록 손해다', () => {
    const r = checkReturnEligibility({
      status: 'SHIPPED', deliveredAt: null, reason: 'CHANGED_MIND',
      now: new Date('2026-12-31T00:00:00+09:00'),
    });
    expect(r.ok).toBe(true);
  });
});

describe('상태', () => {
  const now = new Date(delivered.getTime() + DAY);

  it('구매확정하면 버튼으로 열지 않는다', () => {
    const r = checkReturnEligibility({ status: 'CONFIRMED', deliveredAt: delivered, reason: 'DEFECT', now });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_CONFIRMED' });
  });

  it('이미 접수됐으면 다시 못 낸다', () => {
    const r = checkReturnEligibility({
      status: 'RETURN_REQUESTED', deliveredAt: delivered, reason: 'DEFECT', now,
    });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_REQUESTED' });
  });

  it('출고 전은 반품이 아니라 취소다 — 반송할 물건이 없다', () => {
    for (const status of ['PENDING', 'PAID', 'PREPARING'] as const) {
      expect(
        checkReturnEligibility({ status, deliveredAt: null, reason: 'CHANGED_MIND', now }),
      ).toMatchObject({ ok: false, code: 'NOT_SHIPPED' });
    }
  });

  it('취소·환불된 주문은 대상이 아니다', () => {
    for (const status of ['CANCELLED', 'REFUNDED', 'RETURNED'] as const) {
      expect(
        checkReturnEligibility({ status, deliveredAt: delivered, reason: 'DEFECT', now }).ok,
      ).toBe(false);
    }
  });
});

describe('버튼을 띄울지', () => {
  it('사유를 모르는 시점이라 가장 넉넉한 기한으로 본다', () => {
    // 변심 7일은 지났지만 하자 30일은 남았다 — 버튼이 보여야 한다
    const now = new Date(delivered.getTime() + 10 * DAY);
    expect(canRequestReturn({ status: 'DELIVERED', deliveredAt: delivered, now })).toBe(true);
  });

  it('가장 긴 기한도 지나면 감춘다', () => {
    const now = new Date(delivered.getTime() + 40 * DAY);
    expect(canRequestReturn({ status: 'DELIVERED', deliveredAt: delivered, now })).toBe(false);
  });

  it('구매확정이면 감춘다', () => {
    const now = new Date(delivered.getTime() + DAY);
    expect(canRequestReturn({ status: 'CONFIRMED', deliveredAt: delivered, now })).toBe(false);
  });
});
