import { describe, it, expect } from 'vitest';
import {
  canEditBusinessInfo, canEditMerchantSettings, hasSettlementAccount, isSettlementBank,
  maskAccount, SETTLEMENT_BANK, SETTLEMENT_BANK_LABEL, type Actor,
} from '../src';

/**
 * 정산 계좌.
 *
 * 스키마에는 칸이 처음부터 있었는데 읽는 곳도 쓰는 곳도 없었다 — 계좌를 한 번도 적지 않은 가맹점의 정산도 "지급됨" 이 됐다.
 */

const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const account = (over: Partial<Record<string, string | null>> = {}) => ({
  settlementBank: 'KB', settlementAccount: '12345678901', settlementHolder: '스튜디오눈',
  ...over,
});

describe('돈을 보낼 수 있는 계좌인가', () => {
  it('은행·번호·예금주가 다 있어야 한다', () => {
    expect(hasSettlementAccount(account())).toBe(true);
  });

  it.each(['settlementBank', 'settlementAccount', 'settlementHolder'])('%s 가 없으면 보낼 수 없다', (missing) => {
    // 번호만 있고 예금주가 없으면 보내도 되는지 알 수 없다
    expect(hasSettlementAccount(account({ [missing]: null }))).toBe(false);
  });
});

describe('계좌번호 가리기', () => {
  it('뒤 네 자리만 남긴다 — 맞는지 가리기에는 그것으로 충분하다', () => {
    expect(maskAccount('123-4567-8901')).toBe('*******8901');
  });

  it('없으면 없는 대로 둔다', () => {
    expect(maskAccount(null)).toBeNull();
  });

  it('네 자리 이하면 가릴 것이 없다', () => {
    expect(maskAccount('1234')).toBe('1234');
  });
});

describe('누가 고치는가', () => {
  it('가맹점은 자기 연락처와 계좌를 고친다', () => {
    expect(canEditMerchantSettings(merchant, 'm-a')).toBe(true);
  });

  it('남의 가맹점은 못 고친다', () => {
    expect(canEditMerchantSettings(merchant, 'm-b')).toBe(false);
  });

  it('운영진은 어디든 고친다 — 계좌가 바뀌었다고 전화로 알려 오는 일이 있다', () => {
    expect(canEditMerchantSettings(admin, 'm-a')).toBe(true);
  });

  it('손님은 아무것도 못 고친다', () => {
    expect(canEditMerchantSettings(customer, 'm-a')).toBe(false);
  });

  it('사업자 정보는 운영진만 고친다 — 스스로 바꾸면 돈 받는 주체가 심사 없이 바뀐다', () => {
    expect(canEditBusinessInfo(admin)).toBe(true);
    expect(canEditBusinessInfo(merchant)).toBe(false);
  });
});

describe('은행 목록', () => {
  it('아는 값만 받는다 — 자유 입력이면 같은 은행이 여러 이름으로 섞인다', () => {
    expect(isSettlementBank('KB')).toBe(true);
    expect(isSettlementBank('국민은행')).toBe(false);
  });

  it('모든 은행에 이름표가 있다', () => {
    for (const bank of SETTLEMENT_BANK) {
      expect(SETTLEMENT_BANK_LABEL[bank], bank).toBeTruthy();
    }
  });
});
