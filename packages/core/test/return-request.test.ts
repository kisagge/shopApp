import { describe, it, expect } from 'vitest';
import {
  shippingBorneBy, returnWindowDays, checkReturnEligibility, canRequestReturn,
  availableReturnReasons, isOpenReturn, canCancelOwnReturn, OPEN_RETURN_STATUS,
  RETURN_REASON, returnDeadline,
} from '../src/return-request';
import { kstDayIndex, kstDayStart } from '../src/kst';

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

describe('isOpenReturn', () => {
  it('요청·승인은 진행 중이고, 반려·완료는 끝났다', () => {
    expect(isOpenReturn('REQUESTED')).toBe(true);
    expect(isOpenReturn('APPROVED')).toBe(true);
    expect(isOpenReturn('REJECTED')).toBe(false);
    expect(isOpenReturn('COMPLETED')).toBe(false);
  });
});

/**
 * 손님이 자기 신청을 무를 수 있는 때.
 *
 * **들어가면 나올 문이 없었다.** 무르는 창구가 운영진 쪽에만 있어서, 잘못 신청하면 주문이 반품접수에
 * 갇혀 구매확정도 자동 확정도 안 됐다 — 적립금이 안 나오고 후기도 못 쓴다. 운영진은 "반려" 로 처리할
 * 수밖에 없었고, 거절한 적이 없는데 거절로 남았다.
 */
describe('손님이 무르기', () => {
  it('접수된 신청은 무를 수 있다', () => {
    expect(canCancelOwnReturn('REQUESTED')).toBe(true);
  });

  it('승인 뒤에는 못 무른다 — "보내 주세요" 라고 말한 뒤다', () => {
    /*
     * 승인하면 물건이 오는 중일 수 있다. 그때부터는 손님 혼자 정할 일이 아니라 운영진이 무르는 일이다(철회).
     */
    expect(canCancelOwnReturn('APPROVED')).toBe(false);
  });

  it('이미 끝난 신청도 못 무른다', () => {
    for (const status of ['REJECTED', 'COMPLETED', 'CANCELLED']) {
      expect(canCancelOwnReturn(status), status).toBe(false);
    }
  });

  it('아직 끝나지 않은 신청 목록과 어긋나지 않는다', () => {
    // 무를 수 있는 것은 끝나지 않은 것 중 하나여야 한다 — 끝난 것을 무르면 기록이 두 번 바뀐다
    expect(OPEN_RETURN_STATUS).toContain('REQUESTED');
  });
});

/**
 * **기한을 달력으로 센다.**
 *
 * 전에는 `받은 시각 + 7×24시간` 이었다. 월요일 15시에 받으면 다음 월요일 15시 1분에 닫혔는데,
 * 화면은 손님에게 "배송완료 후 7일 이내에 신청할 수 있습니다" 라고 적는다 — 사람은 그것을 달력으로
 * 읽는다. 받은 시각이 늦을수록 하루를 덜 받는 셈이었고, 시계를 들여다볼 수 없는 손님에게는 까닭
 * 없이 거절당한 것으로 보인다. 받은 날은 세지 않고 그 다음 날부터 센다(초일 불산입).
 */
describe('기한은 달력으로 센다', () => {
  /** 늦은 시각에 받은 주문 — 시각으로 재면 가장 손해를 보던 자리 */
  const lateDelivery = new Date('2026-09-01T23:30:00+09:00');
  const endOfWindow = (reason: typeof RETURN_REASON[number], from: Date) =>
    kstDayStart(kstDayIndex(from) + returnWindowDays(reason) + 1).getTime();
  const ask = (reason: typeof RETURN_REASON[number], now: Date, deliveredAt = lateDelivery) =>
    checkReturnEligibility({ status: 'DELIVERED', deliveredAt, reason, now });

  it.each([...RETURN_REASON])('%s — 마지막 날의 끝까지 받는다', (reason) => {
    const lastMoment = new Date(endOfWindow(reason, lateDelivery) - 1);

    expect(ask(reason, lastMoment).ok).toBe(true);
  });

  it.each([...RETURN_REASON])('%s — 자정이 지나면 거절한다', (reason) => {
    const midnight = new Date(endOfWindow(reason, lateDelivery));

    const r = ask(reason, midnight);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({
      code: 'WINDOW_CLOSED',
      vars: { reason: `returnReason.${reason}`, days: returnWindowDays(reason) },
    });
  });

  /** 시각으로 재던 때라면 이 순간은 이미 닫혀 있었다 — 23시 30분에 받았기 때문이다 */
  it('23시 30분에 받아도 7일을 꽉 받는다', () => {
    const sevenDaysLater = new Date('2026-09-08T20:00:00+09:00');

    expect(ask('CHANGED_MIND', sevenDaysLater).ok).toBe(true);
    // 받은 시각 + 168시간은 9월 8일 23시 30분이라, 20시는 둘 다 통과한다 — 그 뒤가 갈린다
    expect(ask('CHANGED_MIND', new Date('2026-09-08T23:59:59+09:00')).ok).toBe(true);
  });

  it('하루를 더 넘기면 그때는 닫힌다', () => {
    expect(ask('CHANGED_MIND', new Date('2026-09-09T00:00:00+09:00')).ok).toBe(false);
  });

  it('받은 날은 세지 않는다 — 다음 날부터 센다', () => {
    // 9월 1일에 받았으면 9월 2일부터 7일 = 9월 8일이 마지막 날
    const r = ask('CHANGED_MIND', new Date('2026-09-02T00:00:00+09:00'));

    expect(r.ok).toBe(true);
    expect(r.ok && r.deadline.getTime()).toBe(endOfWindow('CHANGED_MIND', lateDelivery) - 1);
  });

  it('돌려주는 기한이 그 마지막 순간과 같다', () => {
    const r = ask('DEFECT', new Date('2026-09-02T00:00:00+09:00'));

    expect(r.ok && r.deadline.getTime()).toBe(endOfWindow('DEFECT', lateDelivery) - 1);
    expect(returnDeadline(lateDelivery, 'DEFECT').getTime()).toBe(r.ok ? r.deadline.getTime() : 0);
  });

  it('변심 7일과 하자 30일이 섞이지 않는다', () => {
    const afterSeven = new Date(endOfWindow('CHANGED_MIND', lateDelivery));

    expect(ask('CHANGED_MIND', afterSeven).ok).toBe(false);
    expect(ask('DEFECT', afterSeven).ok).toBe(true);
  });

  /**
   * **배송 중이면 기한이 아직 시작되지 않았다.** 받기도 전에 기한이 흐르면 배송이 늦을수록
   * 손해다 — 그래서 지금부터 센다(배송완료가 찍히면 그때부터 다시 센다). 의도한 바라 못 박는다.
   */
  it('배송 중이면 지금부터 센다', () => {
    const now = new Date('2026-09-05T13:00:00+09:00');

    const r = checkReturnEligibility({
      status: 'SHIPPED', deliveredAt: null, reason: 'CHANGED_MIND', now,
    });

    expect(r.ok).toBe(true);
    expect(r.ok && r.deadline.getTime()).toBe(endOfWindow('CHANGED_MIND', now) - 1);
  });
});

/**
 * **버튼을 띄울지는 가장 넉넉한 기한으로 본다.** 사유를 아직 모르는 시점이라 좁게 잡으면 하자
 * 신고를 할 수 있는 사람에게 버튼이 안 보인다 — 그 경계도 달력이어야 신청 창구와 어긋나지 않는다.
 */
describe('신청 버튼을 띄울지 — 가장 넉넉한 기한의 경계', () => {
  const deliveredAt = new Date('2026-09-01T23:30:00+09:00');
  const widest = Math.max(...RETURN_REASON.map(returnWindowDays));
  const end = kstDayStart(kstDayIndex(deliveredAt) + widest + 1).getTime();

  it('마지막 날의 끝까지 띄운다', () => {
    expect(canRequestReturn({ status: 'DELIVERED', deliveredAt, now: new Date(end - 1) })).toBe(true);
  });

  it('자정이 지나면 감춘다', () => {
    expect(canRequestReturn({ status: 'DELIVERED', deliveredAt, now: new Date(end) })).toBe(false);
  });

  /** 버튼이 보이면 적어도 한 사유는 받아 줘야 한다 — 눌렀더니 다 막히면 안 된다 */
  it('버튼이 보이는 동안에는 받아 주는 사유가 반드시 있다', () => {
    for (const at of [end - 1, end - DAY, end - 20 * DAY]) {
      const now = new Date(at);
      expect(canRequestReturn({ status: 'DELIVERED', deliveredAt, now }), String(at)).toBe(true);
      expect(
        RETURN_REASON.some((reason) =>
          checkReturnEligibility({ status: 'DELIVERED', deliveredAt, reason, now }).ok),
        String(at),
      ).toBe(true);
    }
  });
});
