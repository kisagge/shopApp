import { describe, it, expect } from 'vitest';
import { INITIAL_ORDER_STATUS } from '../src/order-draft';
import {
  ORDER_STATUS, canTransition, holdsInventory, isCancellableByCustomer, isRepayable, notSentYet,
} from '../src/order-state';

/**
 * **주문이 시작하는 상태** — 주석만 알고 있었다.
 *
 * `order-draft.ts` 는 "주문 생성 시점에 PAID 를 넣으면 안 된다" 고 적어 두었는데, 그 값을
 * `'PAID'` 로 바꿔도 이 저장소의 **어느 검사도 지지 않았다.** 창구 검사들의 `status: 'PENDING'`
 * 은 전부 모의 반환값이라 단정이 아니다.
 *
 * 바뀌면 무슨 일이 벌어지는가: 승인 콜백이 오기 전에 결제된 것처럼 보이고, 승인이 실패해도
 * 되돌릴 근거가 없다. 매출 인식(결제 시각 기준)과 대사 배치가 둘 다 어긋나고, 그 어긋남은
 * **돈이 들어오지 않은 주문을 판 것으로 세는** 모양이다.
 *
 * 그래서 값 하나와, 그 값이 자리로서 갖춰야 하는 성질을 함께 못 박는다.
 */
describe('주문이 시작하는 상태', () => {
  it('PENDING 이다', () => {
    expect(INITIAL_ORDER_STATUS).toBe('PENDING');
  });

  /** 승인 콜백이 옮길 자리다 — 시작부터 PAID 면 옮길 것이 없다 */
  it('PAID 가 아니다', () => {
    expect(INITIAL_ORDER_STATUS).not.toBe('PAID');
  });

  it('주문 상태 목록에 있는 값이다', () => {
    expect(ORDER_STATUS).toContain(INITIAL_ORDER_STATUS);
  });

  it('거기서 PAID 로 가는 길이 전이표에 있다', () => {
    expect(canTransition(INITIAL_ORDER_STATUS, 'PAID')).toBe(true);
  });

  /** 주문을 만들며 재고를 깎았다 — 그 사실이 상태에 적혀 있어야 복원 판단이 맞는다 */
  it('재고를 붙잡는 자리다', () => {
    expect(holdsInventory(INITIAL_ORDER_STATUS)).toBe(true);
  });

  it('아직 보내지 않은 자리다 — 목록이 오래된 것부터 세우고 기다린 날을 적는다', () => {
    expect(notSentYet(INITIAL_ORDER_STATUS)).toBe(true);
  });

  it('손님이 스스로 취소할 수 있다 — 승인이 안 떨어진 주문에 갇히지 않는다', () => {
    expect(isCancellableByCustomer(INITIAL_ORDER_STATUS)).toBe(true);
  });

  /** 입금·승인을 기다리는 자리라 결제를 다시 걸 수 있어야 한다 */
  it('결제를 다시 걸 수 있는 자리다', () => {
    expect(isRepayable(INITIAL_ORDER_STATUS, null)).toBe(true);
  });
});
