import { describe, it, expect } from 'vitest';
import { applyMerchantSchema, merchantSettingsSchema, merchantBusinessSchema } from '../src';

/**
 * 입점 신청·가맹점 설정의 숫자들 — 사업자등록번호와 정산 계좌.
 *
 * **둘 다 `.refine()` 이 한 번도 안 돌았다.** 형식을 다듬는 `.transform()` 과 다듬은 뒤에
 * 길이를 재는 `.refine()` 이 짝으로 붙어 있는데, 그 짝을 아무도 지나가 보지 않았다.
 *
 * 틀리면 **돈이 어디로 가는지와 세금계산서의 근거**가 틀린다.
 */

const apply = {
  name: '무어', brandName: '무어', businessName: '무어 주식회사',
  representative: '김대표', contactEmail: 'a@moor.test', contactPhone: '02-0000-0000',
};
const settings = {
  contactEmail: 'a@moor.test', contactPhone: '02-0000-0000',
  settlementBank: 'KB', settlementHolder: '무어 주식회사',
};

/**
 * **하이픈을 빼고 적는 사람이 많다. 거절하지 말고 표준 표기로 맞춘다.**
 *
 * 다듬기만 하고 끝내면 아무 숫자나 통과한다 — 그래서 다듬은 뒤에 형식을 다시 본다.
 * 그 두 단계가 한 짝이고, 짝의 뒤쪽이 이 검사가 붙드는 자리다.
 */
describe('사업자등록번호', () => {
  it.each([
    ['하이픈 없이', '1234567890'],
    ['하이픈 있게', '123-45-67890'],
    ['앞뒤 공백까지', '  123-45-67890  '],
  ])('%s 적어도 표준 표기로 받는다', (_label, businessNumber) => {
    const r = applyMerchantSchema.safeParse({ ...apply, businessNumber });
    expect(r.success).toBe(true);
    expect(r.success && r.data.businessNumber).toBe('123-45-67890');
  });

  it.each([
    ['짧은 것', '12345'],
    ['긴 것', '12345678901'],
    ['글자가 섞인 것', '123-45-6789a'],
    ['빈 것', ''],
  ])('%s 은 받지 않는다', (_label, businessNumber) => {
    const r = applyMerchantSchema.safeParse({ ...apply, businessNumber });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.bizNumberFormat');
  });

  /** 운영진이 고치는 창구도 같은 규칙이다 — 두 계약이 갈리면 한쪽으로 들어온 값이 다르다 */
  it('운영진 창구도 같은 규칙을 쓴다', () => {
    const business = { name: '무어', businessName: '무어 주식회사', representative: '김대표' };
    expect(merchantBusinessSchema.safeParse({ ...business, businessNumber: '1234567890' }).success).toBe(true);
    expect(merchantBusinessSchema.safeParse({ ...business, businessNumber: '12345' }).success).toBe(false);
  });
});

/**
 * **정산 계좌는 숫자만 남겨 저장한다.**
 *
 * 같은 계좌가 하이픈 유무로 둘이 되면 **바뀌었는지 알 수 없다**(주석이 그 까닭을 적는다).
 * 그래서 다듬어 저장하고, 다듬은 **뒤의 길이**로 받을지 정한다 — 하이픈을 세면 8자리
 * 계좌에 하이픈 둘을 넣은 것이 10자리로 보인다.
 */
describe('정산 계좌', () => {
  it('하이픈을 지우고 숫자만 남긴다', () => {
    const r = merchantSettingsSchema.safeParse({ ...settings, settlementAccount: '123-456-78901' });
    expect(r.success && r.data.settlementAccount).toBe('12345678901');
  });

  it.each([
    ['하한', '12345678'],
    ['상한', '12345678901234567890'],
  ])('숫자 %s 자리는 받는다', (_label, settlementAccount) => {
    expect(merchantSettingsSchema.safeParse({ ...settings, settlementAccount }).success).toBe(true);
  });

  it.each([
    ['하한에서 한 자 모자란 것', '1234567'],
    ['상한을 한 자 넘은 것', '123456789012345678901'],
  ])('%s 은 받지 않는다', (_label, settlementAccount) => {
    const r = merchantSettingsSchema.safeParse({ ...settings, settlementAccount });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.accountFormat');
  });

  /**
   * **하이픈만으로 길이를 채울 수 없다.** 다듬기 전에 재면 `1234-567` 이 8자로 보인다 —
   * 숫자는 일곱뿐이라 실제로는 보낼 수 없는 계좌다.
   */
  it('하이픈은 길이에 들지 않는다', () => {
    expect(merchantSettingsSchema.safeParse({ ...settings, settlementAccount: '1234-567' }).success).toBe(false);
  });

  it('숫자와 하이픈이 아닌 글자는 받지 않는다 — 대개 붙여 넣다 섞인 것이다', () => {
    const r = merchantSettingsSchema.safeParse({ ...settings, settlementAccount: '1234 5678' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.accountFormat');
  });
});
