import { describe, it, expect } from 'vitest';
import { orderView, type OrderViewInput } from '../src/order-view';

/**
 * 주문 상세 화면이 무엇을 세우고 무엇을 감추는가.
 *
 * **이 조합은 지금까지 e2e 로만 확인됐다.** 판정 하나하나는 순수 함수였는데 그것들을
 * 엮는 규칙이 600줄짜리 화면 안에 있어서, "언제 일부 취소 단추가 보이는가" 를 고치려면
 * 브라우저를 띄워야만 답을 알 수 있었다.
 */

const NOW = new Date('2026-09-20T00:00:00Z');

const input = (over: Partial<OrderViewInput> = {}): OrderViewInput => ({
  status: 'PAID',
  payment: {
    method: 'CARD', status: 'DONE',
    virtualAccount: null, virtualBank: null, virtualDueDate: null,
  },
  itemCount: 2,
  liveItemCount: 2,
  deliveredAt: null,
  returnStatus: null,
  now: NOW,
  paymentFailed: false,
  confirmedJustNow: false,
  ...over,
});

describe('일부 상품 취소', () => {
  it('결제된 카드 주문에 두 줄 이상이면 연다', () => {
    expect(orderView(input()).canCancelItems).toBe(true);
  });

  it('한 줄짜리 주문에는 안 연다 — 그건 주문 취소다', () => {
    expect(orderView(input({ itemCount: 1, liveItemCount: 1 })).canCancelItems).toBe(false);
  });

  it('이미 다 취소했으면 안 연다', () => {
    expect(orderView(input({ liveItemCount: 0 })).canCancelItems).toBe(false);
  });

  it('가상계좌는 안 연다 — 입금 전에는 돌려줄 돈이 없다', () => {
    const view = orderView(input({
      payment: {
        method: 'VIRTUAL_ACCOUNT', status: 'DONE',
        virtualAccount: '1234', virtualBank: '국민', virtualDueDate: null,
      },
    }));

    expect(view.canCancelItems).toBe(false);
  });

  it('결제가 안 끝났으면 안 연다', () => {
    const view = orderView(input({
      status: 'PENDING',
      payment: { method: 'CARD', status: 'READY', virtualAccount: null, virtualBank: null, virtualDueDate: null },
    }));

    expect(view.canCancelItems).toBe(false);
  });
});

describe('입금 안내', () => {
  const account = {
    method: 'VIRTUAL_ACCOUNT' as const, status: 'WAITING_FOR_DEPOSIT' as const,
    virtualAccount: '110-123-456789', virtualBank: '신한',
    virtualDueDate: new Date('2026-09-22T14:00:00Z'),
  };

  it('계좌를 받았으면 보여 준다', () => {
    expect(orderView(input({ status: 'PENDING', payment: account })).deposit).toMatchObject({
      bank: '신한', account: '110-123-456789',
    });
  });

  it('계좌번호가 없으면 통째로 감춘다 — 빈 칸이 늘어선 덩이는 "번호가 사라졌다" 로 읽힌다', () => {
    const view = orderView(input({
      status: 'PENDING',
      payment: { ...account, virtualAccount: null },
    }));

    expect(view.deposit).toBeNull();
    expect(view.depositExpired).toBe(false);
  });

  it('기한이 지났으면 그렇게 말한다', () => {
    const view = orderView(input({
      status: 'PENDING',
      payment: { ...account, virtualDueDate: new Date('2026-09-19T14:00:00Z') },
    }));

    expect(view.depositExpired).toBe(true);
  });
});

describe('큰 제목', () => {
  it('결제가 안 끝난 주문에 "접수되었습니다" 라고 쓰지 않는다', () => {
    /*
     * 아래에 "결제가 완료되지 않았습니다" 를 붙여 놓고 큰 제목은 접수됐다고 말하면
     * 둘 중 무엇을 믿어야 할지 알 수 없다 — 경로 알림이 이 제목을 그대로 읽어 준다.
     */
    const view = orderView(input({
      status: 'PENDING',
      payment: { method: 'CARD', status: 'READY', virtualAccount: null, virtualBank: null, virtualDueDate: null },
    }));

    expect(view.repayable).toBe(true);
    expect(view.headline).toBe('unpaid');
  });

  it('끝난 주문은 끝났다고 말한다', () => {
    expect(orderView(input({ status: 'CANCELLED', payment: null })).headline).toBe('closed');
    expect(orderView(input({ status: 'REFUNDED', payment: null })).headline).toBe('closed');
  });

  it('배송중인 주문에 접수 문구를 쓰지 않는다', () => {
    expect(orderView(input({ status: 'SHIPPED' })).headline).toBe('default');
  });
});

describe('구매확정', () => {
  it('배송완료면 확정할 수 있다', () => {
    expect(orderView(input({ status: 'DELIVERED', deliveredAt: NOW })).canConfirmPurchase).toBe(true);
  });

  it('끝나지 않은 반품 신청이 있으면 못 한다 — 돌려보낸 물건을 "이대로 받겠다" 고 할 수 없다', () => {
    const view = orderView(input({
      status: 'DELIVERED', deliveredAt: NOW, returnStatus: 'REQUESTED',
    }));

    expect(view.openReturn).toBe(true);
    expect(view.canConfirmPurchase).toBe(false);
  });

  it('반려된 신청은 막지 않는다 — 다시 낼 수도, 그냥 확정할 수도 있어야 한다', () => {
    const view = orderView(input({
      status: 'DELIVERED', deliveredAt: NOW, returnStatus: 'REJECTED',
    }));

    expect(view.openReturn).toBe(false);
    expect(view.canConfirmPurchase).toBe(true);
  });

  it('방금 눌렀는지는 상태까지 함께 본다 — 주소만 보고 믿으면 아무 주문에나 붙는다', () => {
    expect(orderView(input({ status: 'CONFIRMED', confirmedJustNow: true })).justConfirmed).toBe(true);
    expect(orderView(input({ status: 'DELIVERED', confirmedJustNow: true })).justConfirmed).toBe(false);
  });
});

describe('반품·교환 신청', () => {
  it('배송완료 뒤 기한 안이면 연다', () => {
    const view = orderView(input({
      status: 'DELIVERED',
      deliveredAt: new Date('2026-09-18T00:00:00Z'),
    }));

    expect(view.showReturnForm).toBe(true);
  });

  it('받기 전에는 안 연다', () => {
    expect(orderView(input({ status: 'PREPARING' })).showReturnForm).toBe(false);
  });
});
