import { describe, it, expect } from 'vitest';
import { checkAddressEdit, remoteSurchargeDelta } from '../src/address-edit';
import type { OrderStatus } from '../src/order-state';

/**
 * 배송지를 언제까지 고칠 수 있는가.
 *
 * **아무도 못 고쳤다.** 상세주소를 잘못 적으면 출고 전이라도 방법이 없어, 취소하고 다시 사거나 1:1 문의로
 * 부탁해야 했다. 여는 것은 쉬운데 경계가 둘이다 — 물건이 나간 뒤(오배송)와 돈이 굳은 뒤(차액).
 */

const input = (over: Partial<Parameters<typeof checkAddressEdit>[0]> = {}) => ({
  status: 'PAID' as OrderStatus,
  settled: true,
  awaitingDeposit: false,
  wasRemote: false,
  nowRemote: false,
  ...over,
});

describe('고칠 수 있는 때', () => {
  it.each<OrderStatus>(['PENDING', 'PAID', 'PREPARING'])('%s 는 고칠 수 있다', (status) => {
    expect(checkAddressEdit(input({ status }))).toBeNull();
  });

  /**
   * **송장이 나간 뒤에 주소를 바꾸면 오배송이다.** 화면에는 바뀐 주소가 보이는데 물건은 옛 주소로 간다 —
   * 손님은 잘못 갔다는 것조차 늦게 안다.
   */
  it.each<OrderStatus>(['SHIPPED', 'DELIVERED', 'CONFIRMED'])('%s 는 막는다', (status) => {
    expect(checkAddressEdit(input({ status }))).toBe('ALREADY_SHIPPED');
  });

  it.each<OrderStatus>(['CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'])(
    '%s 는 끝난 주문으로 막는다',
    (status) => {
      expect(checkAddressEdit(input({ status }))).toBe('ORDER_CLOSED');
    },
  );
});

describe('같은 권역 안의 수정', () => {
  /** 흔한 쪽은 이것이다 — 동·호수를 빠뜨렸거나 받는 사람을 바꾼다. 돈이 안 움직이니 결제 뒤에도 연다 */
  it('결제가 끝났어도 도서산간 여부가 그대로면 고칠 수 있다', () => {
    expect(checkAddressEdit(input({ settled: true, wasRemote: false, nowRemote: false }))).toBeNull();
  });

  it('도서산간 안에서 도서산간으로 옮기는 것도 고칠 수 있다', () => {
    expect(checkAddressEdit(input({ settled: true, wasRemote: true, nowRemote: true }))).toBeNull();
  });
});

describe('권역이 달라질 때', () => {
  /** 결제 전이면 아직 아무것도 안 굳었다 — 배송비를 다시 세고 넘어간다 */
  it('결제 전에는 권역이 달라져도 고칠 수 있다', () => {
    expect(checkAddressEdit(input({ status: 'PENDING', settled: false, nowRemote: true }))).toBeNull();
  });

  /**
   * **차액을 주고받을 길이 없다.** 추가 결제도 부분 환불도 경로가 따로 필요하다. 조용히 배송비만 바꾸면
   * 결제 금액과 주문 금액이 어긋난 채 정산까지 흘러간다.
   */
  it('결제가 끝났으면 권역이 달라지는 주소는 막는다', () => {
    expect(checkAddressEdit(input({ settled: true, nowRemote: true })))
      .toBe('ZONE_CHANGE_AFTER_PAYMENT');
  });

  it('도서산간에서 나오는 쪽도 똑같이 막는다 — 깎는 것도 환불이다', () => {
    expect(checkAddressEdit(input({ settled: true, wasRemote: true, nowRemote: false })))
      .toBe('ZONE_CHANGE_AFTER_PAYMENT');
  });

  /** 가상계좌는 입금할 금액이 이미 발급돼 있다. 금액이 바뀌면 그 계좌로는 맞출 수 없다 */
  it('입금 기다리는 중이면 따로 말해 준다', () => {
    expect(checkAddressEdit(input({ status: 'PENDING', settled: false, awaitingDeposit: true, nowRemote: true })))
      .toBe('ZONE_CHANGE_ON_DEPOSIT');
  });

  it('입금 대기가 결제 완료보다 먼저 읽힌다 — 이유가 더 구체적이다', () => {
    expect(checkAddressEdit(input({ settled: true, awaitingDeposit: true, nowRemote: true })))
      .toBe('ZONE_CHANGE_ON_DEPOSIT');
  });

  /** 출고 여부가 먼저다. 이미 나간 주문은 권역이 같든 다르든 고칠 수 없다 */
  it('출고 뒤에는 권역이 그대로여도 막는다', () => {
    expect(checkAddressEdit(input({ status: 'SHIPPED', wasRemote: true, nowRemote: true })))
      .toBe('ALREADY_SHIPPED');
  });
});

describe('바뀌는 배송비', () => {
  it('도서산간으로 들어가면 추가 배송비만큼 는다', () => {
    expect(remoteSurchargeDelta({ wasRemote: false, nowRemote: true, surcharge: 3_000 })).toBe(3_000);
  });

  it('도서산간에서 나오면 그만큼 준다', () => {
    expect(remoteSurchargeDelta({ wasRemote: true, nowRemote: false, surcharge: 3_000 })).toBe(-3_000);
  });

  /**
   * **기본 배송비와 무료 문턱은 건드리지 않는다.** 주소를 고쳤다고 무료배송이 붙거나 떨어지면, 산 값이
   * 그대로인데 낼 돈이 달라진다 — 추가 배송비만 더하고 뺀다.
   */
  it.each([
    [false, false],
    [true, true],
  ])('권역이 그대로면 움직이지 않는다 (%s → %s)', (wasRemote, nowRemote) => {
    expect(remoteSurchargeDelta({ wasRemote, nowRemote, surcharge: 3_000 })).toBe(0);
  });

  it('추가 배송비가 0인 정책이면 권역이 바뀌어도 0이다', () => {
    expect(remoteSurchargeDelta({ wasRemote: false, nowRemote: true, surcharge: 0 })).toBe(0);
  });
});
