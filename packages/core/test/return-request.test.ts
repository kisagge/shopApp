import { describe, it, expect } from 'vitest';
import {
  shippingBorneBy, returnWindowDays, checkReturnEligibility, canRequestReturn,
  availableReturnReasons,
  RETURN_REASON,
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

  /**
   * 확정은 "이대로 받겠다" 는 뜻이지 판매자 잘못까지 떠안겠다는 뜻이 아니다.
   */
  it('구매확정 뒤에도 하자는 받는다', () => {
    for (const reason of ['DEFECT', 'WRONG_ITEM', 'DAMAGED'] as const) {
      const r = checkReturnEligibility({ status: 'CONFIRMED', deliveredAt: delivered, reason, now });
      expect(r, reason).toMatchObject({ ok: true, borneBy: 'SELLER' });
    }
  });

  it('구매확정 뒤 단순 변심은 막는다 — 확정이 곧 그 답이었다', () => {
    const r = checkReturnEligibility({
      status: 'CONFIRMED', deliveredAt: delivered, reason: 'CHANGED_MIND', now,
    });
    expect(r).toMatchObject({ ok: false, code: 'ALREADY_CONFIRMED' });
  });

  it('확정이 기한을 늘려 주지는 않는다', () => {
    const late = new Date(delivered.getTime() + 31 * DAY);
    const r = checkReturnEligibility({
      status: 'CONFIRMED', deliveredAt: delivered, reason: 'DEFECT', now: late,
    });
    expect(r).toMatchObject({ ok: false, code: 'WINDOW_CLOSED' });
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

  /** 사유를 아직 모르는 시점이라 넉넉하게 본다. 눌러서 고르면 그때 정확히 다시 본다. */
  it('구매확정이어도 띄운다 — 하자 신고를 할 수 있는 사람에게 버튼이 없으면 안 된다', () => {
    const now = new Date(delivered.getTime() + DAY);
    expect(canRequestReturn({ status: 'CONFIRMED', deliveredAt: delivered, now })).toBe(true);
  });
});

describe('고를 수 있는 사유', () => {
  it('배송완료 뒤에는 다 고를 수 있다', () => {
    expect(availableReturnReasons('DELIVERED')).toEqual([...RETURN_REASON]);
  });

  /**
   * 화면이 고를 수 없는 것을 내밀면 사람은 그것을 골라 제출하고 나서야 안
   * 된다는 말을 듣는다. 구매확정한 주문에서 단순 변심이 기본값으로 선택돼
   * 있던 자리가 그랬다.
   */
  it('구매확정 뒤에는 판매자 귀책만 남는다', () => {
    const reasons = availableReturnReasons('CONFIRMED');

    expect(reasons).not.toContain('CHANGED_MIND');
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('고를 수 있는 사유는 전부 실제로 신청이 된다 — 목록과 판정이 어긋나면 안 된다', () => {
    const delivered = new Date('2026-09-01T00:00:00Z');
    const now = new Date('2026-09-05T00:00:00Z');

    for (const status of ['DELIVERED', 'CONFIRMED'] as const) {
      for (const reason of availableReturnReasons(status)) {
        expect(
          checkReturnEligibility({ status, deliveredAt: delivered, reason, now }),
          `${status}/${reason}`,
        ).toMatchObject({ ok: true });
      }
    }
  });
});
