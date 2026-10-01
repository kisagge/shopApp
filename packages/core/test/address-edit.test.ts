import { describe, it, expect } from 'vitest';
import {
  changedAddressFields, checkAddressEdit, remoteSurchargeDelta, showsAddressChanged,
  tellsAddressChange,
} from '../src/address-edit';
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
  awaitingExchangeReship: false,
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

/**
 * 교환 상품을 받을 주소.
 *
 * **아무도 고칠 수 없었다.** 교환이 도는 동안 주문은 반품접수에 머무는데, 그 상태의 수정은 "끝난 주문"
 * 으로 묶여 거절됐다 — 주문하고 이사한 사람은 새 물건을 옛 주소로 받고, 운영자도 도울 길이 없었다.
 * 그 주문은 끝난 것이 아니라 **아직 보낼 물건이 남아 있다.**
 */
describe('교환 상품을 기다리는 중', () => {
  const awaiting = (over: Record<string, unknown> = {}) =>
    input({ status: 'RETURN_REQUESTED', awaitingExchangeReship: true, ...over });

  it('같은 권역 안에서는 고칠 수 있다 — 이사한 사람이 옛 주소로 받지 않게', () => {
    expect(checkAddressEdit(awaiting())).toBeNull();
  });

  /**
   * 권역이 달라지면 배송비가 움직이는데 그 주문의 돈은 오래전에 끝났고, 교환의 반송·재발송 비용은 이미
   * 사유에 따라 정해져 있다.
   */
  it('권역이 달라지는 주소는 막는다 — 그 주문의 돈은 오래전에 끝났다', () => {
    expect(checkAddressEdit(awaiting({ nowRemote: true }))).toBe('ZONE_CHANGE_ON_EXCHANGE');
    expect(checkAddressEdit(awaiting({ wasRemote: true, nowRemote: false }))).toBe('ZONE_CHANGE_ON_EXCHANGE');
  });

  /** 반품(교환이 아닌)은 돌려보내기만 한다 — 우리가 보낼 물건이 없으므로 주소를 고칠 일도 없다 */
  it('교환을 기다리는 것이 아니면 여전히 끝난 주문이다', () => {
    expect(checkAddressEdit(input({ status: 'RETURN_REQUESTED' }))).toBe('ORDER_CLOSED');
  });

  /** 새 물건이 이미 나갔으면 늦었다 — 송장이 붙은 뒤에는 그 주소로 가고 있다 */
  it('새 물건을 보낸 뒤에는 막는다', () => {
    expect(checkAddressEdit(input({ status: 'RETURN_REQUESTED', awaitingExchangeReship: false })))
      .toBe('ORDER_CLOSED');
  });

  /** 이미 나간 주문이 먼저다 — 교환을 기다린다고 배송중인 주문의 주소가 열리지는 않는다 */
  it.each<OrderStatus>(['SHIPPED', 'DELIVERED', 'CONFIRMED'])('%s 에서는 교환이어도 막는다', (status) => {
    expect(checkAddressEdit(awaiting({ status }))).toBe('ALREADY_SHIPPED');
  });

  /** 반품완료·환불완료는 보낼 물건이 없다 */
  it.each<OrderStatus>(['RETURNED', 'REFUNDED', 'CANCELLED'])('%s 에서는 막는다', (status) => {
    expect(checkAddressEdit(awaiting({ status }))).toBe('ORDER_CLOSED');
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

/**
 * **출고 직전에 주소가 바뀌면 운영자는 알 길이 없었다.** 화면에는 새 주소가 보이지만, 피킹 목록을
 * 이미 뽑았거나 송장을 붙이려던 사람에게는 그 사실이 어디에도 나타나지 않는다 — 처리 이력에 남길
 * 한 줄을 만들려면 먼저 무엇이 달라졌는지 골라야 한다.
 */
describe('무엇이 바뀌었는가', () => {
  const addr = {
    recipient: '장보영',
    phone: '010-1234-5678',
    postalCode: '04766',
    address1: '서울 성동구 왕십리로 1',
    address2: '101호',
    memo: null,
  };

  it('같은 값을 다시 저장한 것은 빈 목록이다 — 이력에 남길 일이 아니다', () => {
    expect(changedAddressFields(addr, { ...addr })).toEqual([]);
  });

  it('바뀐 칸만 고른다', () => {
    expect(changedAddressFields(addr, { ...addr, address2: '102호' })).toEqual(['address2']);
  });

  it('여러 칸이 바뀌면 적힌 차례대로 준다 — 이력의 줄이 매번 같은 순서로 읽힌다', () => {
    expect(changedAddressFields(addr, { ...addr, recipient: '장부장', postalCode: '63309' }))
      .toEqual(['recipient', 'postalCode']);
  });

  /** 비어 있던 칸을 채우는 것도 바뀐 것이다 — 상세주소를 빠뜨렸다가 적는 것이 가장 흔한 수정이다 */
  it('없던 값이 생긴 것도 바뀐 것으로 본다', () => {
    expect(changedAddressFields({ ...addr, address2: null }, addr)).toEqual(['address2']);
  });

  it('비운 것도 바뀐 것으로 본다', () => {
    expect(changedAddressFields(addr, { ...addr, memo: null, address2: null })).toEqual(['address2']);
  });

  /** null 과 빈 글자는 사람에게 같은 것이다 — 그 차이로 이력에 줄을 남기지 않는다 */
  it('빈 글자와 없음은 같게 본다', () => {
    expect(changedAddressFields({ ...addr, memo: null }, { ...addr, memo: '' })).toEqual([]);
  });
});

/**
 * 목록에서 "배송지 변경" 을 세울 것인가.
 *
 * **처리 이력의 줄은 주문을 열어야 보인다.** 피킹 목록을 이미 뽑았거나 송장을 붙이려던 사람은 열어 볼
 * 이유가 없어서, 주소가 바뀐 줄 모르고 옛 주소로 보낸다.
 */
describe('배송지 변경 표시', () => {
  const at = new Date('2026-09-30T04:00:00Z');

  it('고친 적이 없으면 세우지 않는다', () => {
    expect(showsAddressChanged({ status: 'PAID', addressChangedAt: null })).toBe(false);
  });

  it.each<OrderStatus>(['PENDING', 'PAID', 'PREPARING'])('%s 는 세운다 — 아직 손을 쓸 수 있다', (status) => {
    expect(showsAddressChanged({ status, addressChangedAt: at })).toBe(true);
  });

  /**
   * 나간 뒤에는 표시가 남아도 할 일이 없다 — 그 기록은 처리 이력이 갖고 있다. 목록에 계속 남으면
   * 정작 손을 써야 하는 주문이 그 사이에 묻힌다.
   */
  it.each<OrderStatus>(['SHIPPED', 'DELIVERED', 'CONFIRMED', 'CANCELLED', 'REFUNDED'])(
    '%s 는 세우지 않는다',
    (status) => {
      expect(showsAddressChanged({ status, addressChangedAt: at })).toBe(false);
    },
  );

  /** 고칠 수 있는 구간과 같은 목록이다 — 두 곳이 갈리면 "고칠 수 있는데 표시는 없는" 주문이 생긴다 */
  it('고칠 수 있는 주문이면 반드시 표시할 수 있다', () => {
    for (const status of ['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'CANCELLED'] as const) {
      const editable = checkAddressEdit(input({ status, settled: false, awaitingDeposit: false })) === null;
      expect(showsAddressChanged({ status, addressChangedAt: at })).toBe(editable);
    }
  });
});

/**
 * 알림까지 밀 것인가.
 *
 * **목록의 표시·상세의 안내·송장 등록의 확인은 셋 다 열어 봐야 보인다.** 피킹을 시작한 사람은 목록을
 * 다시 열 이유가 없어서 그 셋을 모두 지나친다 — 알림함은 열어 보지 않아도 뱃지가 뜨는 유일한 자리다.
 */
describe('알림까지 미는 때', () => {
  it('배송 준비 중이면 민다 — 라벨을 찍었을 수 있다', () => {
    expect(tellsAddressChange('PREPARING')).toBe(true);
  });

  /**
   * 주문한 지 1분 만에 상세주소를 고치는 것이 가장 흔한 수정이다. 그것마다 울리면 정작 위험한 한 번이
   * 그 사이에 묻힌다 — 아직 아무도 물건을 만지지 않은 상태에서는 목록의 표시로 충분하다.
   */
  it.each<OrderStatus>(['PENDING', 'PAID'])('%s 는 밀지 않는다 — 아직 아무도 물건을 만지지 않았다', (status) => {
    expect(tellsAddressChange(status)).toBe(false);
  });

  it.each<OrderStatus>(['SHIPPED', 'DELIVERED', 'CANCELLED'])('%s 는 밀지 않는다', (status) => {
    expect(tellsAddressChange(status)).toBe(false);
  });

  /** 표시하지 않는 주문을 알리지는 않는다 — 알림을 누르고 들어가 아무 표시도 못 보면 무슨 일인지 모른다 */
  it('미는 주문은 반드시 표시도 한다', () => {
    for (const status of ['PENDING', 'PAID', 'PREPARING', 'SHIPPED'] as const) {
      if (tellsAddressChange(status)) {
        expect(showsAddressChanged({ status, addressChangedAt: new Date() })).toBe(true);
      }
    }
  });
});
