import { describe, it, expect } from 'vitest';
import {
  checkClosure, closedAccountEmail, isClosedAccountEmail,
  CLOSURE_EFFECT, CLOSURE_CONFIRM_PHRASE,
} from '../src/account-closure';

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
