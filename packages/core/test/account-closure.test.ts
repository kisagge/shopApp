import { describe, it, expect } from 'vitest';
import {
  checkClosure, closedAccountEmail, isClosedAccountEmail,
  CLOSURE_EFFECT, CLOSURE_CONFIRM_PHRASE,
} from '../src/account-closure';
import { ORDER_STATUS, notSentYet, holdsInventory } from '../src/order-state';
import { canRequestReturn } from '../src/return-request';

const order = (over: Record<string, unknown> = {}) =>
  ({ status: 'CONFIRMED', returnable: false, ...over }) as any;

describe('막는 이유', () => {
  it('아무것도 걸리지 않으면 탈퇴할 수 있다', () => {
    expect(checkClosure({ role: 'CUSTOMER', orders: [order()] })).toEqual({
      allowed: true, blocks: [],
    });
  });

  it('주문이 하나도 없어도 탈퇴할 수 있다', () => {
    expect(checkClosure({ role: 'CUSTOMER', orders: [] }).allowed).toBe(true);
  });

  it('배송이 끝나지 않은 주문이 막는다', () => {
    for (const status of ['PENDING', 'PAID', 'PREPARING', 'SHIPPED']) {
      const result = checkClosure({ role: 'CUSTOMER', orders: [order({ status })] });
      expect(result.blocks, status).toContain('IN_FLIGHT_ORDER');
    }
  });

  it('처리 중인 반품이 막는다', () => {
    const result = checkClosure({ role: 'CUSTOMER', orders: [order({ status: 'RETURN_REQUESTED' })] });
    expect(result.blocks).toContain('OPEN_RETURN');
  });

  it('반품 기간이 남아 있으면 막는다', () => {
    // 탈퇴하면 반품 신청을 할 수 없게 된다. 기간이 남았는데 길을 막으면 안 된다.
    const result = checkClosure({
      role: 'CUSTOMER',
      orders: [order({ status: 'DELIVERED', returnable: true })],
    });
    expect(result.blocks).toContain('RETURNABLE_ORDER');
  });

  it('기간이 지난 배송 완료 주문은 막지 않는다', () => {
    const result = checkClosure({
      role: 'CUSTOMER',
      orders: [order({ status: 'DELIVERED', returnable: false })],
    });
    expect(result.allowed).toBe(true);
  });

  it('고객이 아닌 계정은 스스로 탈퇴하지 못한다', () => {
    /*
     * 가맹점은 정산을 받는 주체라 계정이 사라지면 지급할 곳이 없어지고,
     * 운영진이 조용히 사라지면 감사 로그의 행위자를 되짚을 수 없다.
     */
    for (const role of ['MERCHANT', 'ADMIN', 'SUPER_ADMIN'] as const) {
      expect(checkClosure({ role, orders: [] }).blocks, role).toContain('STAFF_ACCOUNT');
    }
  });

  it('막는 이유를 전부 돌려준다', () => {
    // 하나씩 알려 주면 고칠 때마다 다시 와야 한다
    const result = checkClosure({
      role: 'MERCHANT',
      orders: [order({ status: 'SHIPPED' }), order({ status: 'RETURN_REQUESTED' })],
    });

    expect(result.blocks).toHaveLength(3);
    expect(result.allowed).toBe(false);
  });

  it('같은 이유가 여러 주문에서 나와도 한 번만 담는다', () => {
    const result = checkClosure({
      role: 'CUSTOMER',
      orders: [order({ status: 'SHIPPED' }), order({ status: 'PAID' })],
    });
    expect(result.blocks).toEqual(['IN_FLIGHT_ORDER']);
  });

  // 막는 이유의 문구는 사전이 가진다 — apps/web 의 closure-copy 검사가 지킨다
});

describe('탈퇴 계정 값', () => {
  it('이메일은 실제로 존재할 수 없는 주소로 바꾼다', () => {
    // .invalid 는 예약된 도메인이라(RFC 2606) 누구의 주소와도 겹치지 않는다
    expect(closedAccountEmail('u-1')).toBe('withdrawn-u-1@removed.invalid');
    expect(isClosedAccountEmail(closedAccountEmail('u-1'))).toBe(true);
  });

  it('사용자마다 다르다 — 유니크 제약을 넘어야 한다', () => {
    expect(closedAccountEmail('u-1')).not.toBe(closedAccountEmail('u-2'));
  });

  it('평범한 주소는 탈퇴 주소가 아니다', () => {
    expect(isClosedAccountEmail('demo@plain.test')).toBe(false);
    // 도메인이 아니라 문자열 일부로만 겹치는 경우
    expect(isClosedAccountEmail('a@removed.invalid.example.com')).toBe(false);
  });
});

describe('안내 표', () => {
  it('지우는 것과 남기는 것이 모두 있다', () => {
    expect(CLOSURE_EFFECT.some((e) => e.how === 'erase')).toBe(true);
    expect(CLOSURE_EFFECT.some((e) => e.how === 'keep')).toBe(true);
  });

  it('남기는 것에는 반드시 이유가 붙는다', () => {
    // 왜 남는지 말하지 않으면 지우지 않은 것으로 읽힌다
    for (const effect of CLOSURE_EFFECT.filter((e) => e.how === 'keep')) {
      expect(effect.explains, effect.id).toBe(true);
    }
  });

  it('항목 이름이 겹치지 않는다 — 사전 열쇠가 된다', () => {
    const ids = CLOSURE_EFFECT.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('확인 문구가 비어 있지 않다', () => {
    expect(CLOSURE_CONFIRM_PHRASE.length).toBeGreaterThan(0);
  });
});

/**
 * **막는 상태를 전수로 본다.**
 *
 * 네 값을 손으로 적은 루프가 있었다(위) — 그 목록에 상태를 빠뜨려도 검사는 통과한다. 상태가
 * 하나 늘면 "아직 배송 중인데 탈퇴가 되는" 자리가 조용히 생기고, 탈퇴는 **되돌릴 수 없다.**
 *
 * 여집합도 함께 못 박는다. 막는 쪽만 보면 "전부 막는" 구현도 통과하는데, 그러면 아무도
 * 탈퇴하지 못한다 — 그것도 고장이다.
 */
describe('탈퇴를 막는 상태 — 전수로', () => {
  const ask = (status: typeof ORDER_STATUS[number], returnable = false) =>
    checkClosure({ role: 'CUSTOMER', orders: [order({ status, returnable })] });

  /** 아직 보낼 일이 남았거나 가는 중인 주문 = 받기 전이다. 그 사이에 계정이 사라지면 안 된다 */
  it.each([...ORDER_STATUS])('%s — 가는 중인 주문만 배송으로 막는다', (status) => {
    const blocked = ask(status).blocks.includes('IN_FLIGHT_ORDER');

    expect(blocked).toBe(notSentYet(status) || status === 'SHIPPED');
  });

  it.each([...ORDER_STATUS])('%s — 반품 기간이 남아 있으면 무조건 막는다', (status) => {
    expect(ask(status, true).allowed).toBe(false);
  });

  /** 막는 이유가 하나도 없는 상태는 이것뿐이다 — 상태가 늘면 이 목록이 먼저 진다 */
  it('끝난 주문만 탈퇴를 막지 않는다', () => {
    const free = ORDER_STATUS.filter((status) => ask(status).allowed);

    expect([...free]).toEqual(['DELIVERED', 'CONFIRMED', 'CANCELLED', 'RETURNED', 'REFUNDED']);
  });

  /**
   * **반품 신청을 받는 주문은 반드시 탈퇴를 막는다.** 탈퇴하면 신청할 길이 없어지므로, 한쪽이
   * "아직 신청할 수 있다" 고 하면서 다른 쪽이 계정을 닫으면 손님은 물건을 돌려보낼 수 없다.
   */
  it('반품 신청을 받는 주문은 탈퇴를 막는다', () => {
    const deliveredAt = new Date('2026-09-01T10:00:00+09:00');
    const now = new Date('2026-09-03T10:00:00+09:00');

    for (const status of ORDER_STATUS) {
      const canReturn = canRequestReturn({ status, deliveredAt, now });
      if (!canReturn) continue;
      expect(ask(status, true).allowed, `${status} — 신청은 받는데 탈퇴가 된다`).toBe(false);
    }
  });

  /** 재고를 붙잡고 있다 = 아직 거래가 끝나지 않았다. 그 상태에서 막지 않는 것은 DELIVERED·CONFIRMED 뿐이다 */
  it('재고를 쥔 주문 중 막지 않는 것은 받은 뒤의 둘뿐이다', () => {
    const holding = ORDER_STATUS.filter(holdsInventory);
    const notBlocked = holding.filter((status) => ask(status).allowed);

    expect([...notBlocked]).toEqual(['DELIVERED', 'CONFIRMED']);
  });
});
