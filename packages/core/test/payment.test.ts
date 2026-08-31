import { describe, it, expect } from 'vitest';
import { won } from '../src/money';
import {
  PAYMENT_STATUS_CODE, PAYMENT_STATUS_LABEL, PAYMENT_METHOD_CODE,
  isPaidStatus, assertPaymentAmount, PaymentError,
} from '../src/payment';

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
