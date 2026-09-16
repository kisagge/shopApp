import { describe, it, expect } from 'vitest';
import { won } from '../src/money';
import {
  PAYMENT_STATUS_CODE, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_CODE,
  isPaidStatus, assertPaymentAmount, PaymentError, awaitingDeposit, depositExpired,
} from '../src/payment';
import { isRepayable } from '../src/order-state';

describe('결제 상태', () => {
  it('모든 상태에 한글 라벨이 있다', () => {
    for (const s of PAYMENT_STATUS_CODE) expect(PAYMENT_STATUS_LABEL[s]).toBeTruthy();
  });

  it('돈이 실제로 들어온 상태를 구분한다', () => {
    expect(isPaidStatus('DONE')).toBe(true);
    // 부분 취소는 나머지 금액이 아직 결제된 상태다
    expect(isPaidStatus('PARTIAL_CANCELED')).toBe(true);
  });

  it.each(['READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'CANCELED', 'ABORTED', 'EXPIRED', 'FAILED'] as const)(
    '%s 는 결제된 것으로 보지 않는다',
    (s) => expect(isPaidStatus(s)).toBe(false),
  );

  it('가상계좌 입금 대기는 결제가 아니다 — 여기서 매출로 잡으면 안 된다', () => {
    expect(isPaidStatus('WAITING_FOR_DEPOSIT')).toBe(false);
  });

  it('결제 수단이 네 가지다', () => {
    expect(PAYMENT_METHOD_CODE).toEqual(['CARD', 'TRANSFER', 'VIRTUAL_ACCOUNT', 'EASY_PAY']);
  });
});

describe('assertPaymentAmount — 뚫리면 1원으로 물건을 산다', () => {
  it('같으면 통과한다', () => {
    expect(() => assertPaymentAmount(won(289_000), 289_000)).not.toThrow();
  });

  it('적게 보내면 막는다', () => {
    expect(() => assertPaymentAmount(won(289_000), 1)).toThrow(PaymentError);
  });

  it('많이 보내도 막는다 — 초과 결제도 사고다', () => {
    expect(() => assertPaymentAmount(won(289_000), 500_000)).toThrow(PaymentError);
  });

  it('에러에 두 금액을 모두 담는다 — 대사할 때 필요하다', () => {
    try {
      assertPaymentAmount(won(289_000), 1);
      expect.unreachable('던졌어야 한다');
    } catch (e) {
      expect((e as PaymentError).code).toBe('AMOUNT_MISMATCH');
      expect((e as Error).message).toContain('289000');
      expect((e as Error).message).toContain('1');
    }
  });
});

describe('입금할 곳을 보여 줄 때', () => {
  /*
   * **계좌를 받아 두고 보여 주지 않고 있었다.** 가상계좌 셋을 결제 때 저장하는데
   * 읽는 곳이 없어서, 주문 화면은 "결제가 확인되면 배송 준비를 시작합니다" 만
   * 말했다. 탭을 닫았거나 메일이 스팸함에 갔으면 화면에서 입금할 방법이 없었다.
   */
  it('가상계좌로 입금을 기다리는 중이면 보여 준다', () => {
    expect(awaitingDeposit('VIRTUAL_ACCOUNT', 'WAITING_FOR_DEPOSIT')).toBe(true);
  });

  it('기한이 지난 것도 보여 준다 — 만료됐다는 사실 자체가 알아야 할 소식이다', () => {
    expect(awaitingDeposit('VIRTUAL_ACCOUNT', 'EXPIRED')).toBe(true);
  });

  it('다른 결제 수단에는 보여 줄 계좌가 없다', () => {
    for (const method of ['CARD', 'TRANSFER', 'EASY_PAY'] as const) {
      expect(awaitingDeposit(method, 'WAITING_FOR_DEPOSIT'), method).toBe(false);
    }
  });

  it('이미 입금됐거나 끝난 주문에는 보여 주지 않는다', () => {
    for (const status of ['DONE', 'CANCELED', 'PARTIAL_CANCELED'] as const) {
      expect(awaitingDeposit('VIRTUAL_ACCOUNT', status), status).toBe(false);
    }
  });

  it('결제 행이 아직 없으면 보여 줄 것이 없다', () => {
    expect(awaitingDeposit(null, null)).toBe(false);
    expect(awaitingDeposit('VIRTUAL_ACCOUNT', null)).toBe(false);
  });

  it('재결제와 겹치지 않는다', () => {
    /*
     * isRepayable 이 입금 대기를 빼는 것은 맞다 — 그때 할 일은 송금이지 재결제가
     * 아니고, 다시 걸면 이미 받은 계좌를 버리게 된다. 둘이 동시에 뜨면 안 된다.
     */
    expect(isRepayable('PENDING', 'WAITING_FOR_DEPOSIT')).toBe(false);
    expect(awaitingDeposit('VIRTUAL_ACCOUNT', 'READY')).toBe(false);
    expect(isRepayable('PENDING', 'READY')).toBe(true);
  });
});

describe('입금 기한', () => {
  const NOW = new Date('2026-09-16T00:00:00.000Z');

  it('지났으면 지났다고 한다', () => {
    expect(depositExpired(new Date('2026-09-15T23:59:00.000Z'), NOW)).toBe(true);
  });

  it('아직이면 아니다', () => {
    expect(depositExpired(new Date('2026-09-16T00:01:00.000Z'), NOW)).toBe(false);
  });

  it('기한이 없으면 지나지 않은 것으로 본다 — PG 가 기한을 안 주는 경우가 있다', () => {
    expect(depositExpired(null, NOW)).toBe(false);
  });

  it('딱 그 시각이면 지난 것이다 — 경계에서 입금하면 받아 주지 않는다', () => {
    expect(depositExpired(NOW, NOW)).toBe(true);
  });
});
