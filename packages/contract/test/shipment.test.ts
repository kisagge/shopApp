import { describe, it, expect } from 'vitest';
import { CARRIER_CODE } from '@shop/core';
import { registerShipmentSchema } from '../src';

/**
 * 송장 등록 계약.
 *
 * **형식을 보는 `.refine()` 이 한 번도 안 돌았다.** 송장번호는 손님에게 그대로 나가
 * 택배사 조회에 쓰인다 — 자릿수가 안 맞는 값을 받으면 손님은 "조회되지 않는 송장" 을
 * 들고 고객센터에 묻는다.
 *
 * 택배사마다 자릿수가 달라 **범위로 본다**(9~20). 하이픈·공백은 세지 않는다.
 */
describe('송장번호', () => {
  const ok = { carrier: 'CJ' as const };

  it.each([
    ['하한 9자리', '123456789'],
    ['상한 20자리', '12345678901234567890'],
    ['하이픈이 섞인 것', '1234-5678-9012'],
    ['공백이 섞인 것', '1234 5678 9012'],
  ])('%s 은 받는다', (_label, trackingNumber) => {
    expect(registerShipmentSchema.safeParse({ ...ok, trackingNumber }).success).toBe(true);
  });

  it.each([
    ['숫자가 여덟뿐인 것', '12345678'],
    ['하이픈으로 자릿수를 채운 것', '1-2-3-4-5-6-7-8'],
    ['숫자가 스물한 개인 것', '123456789012345678901'],
    ['숫자가 없는 것', 'ABCDEFGHIJ'],
  ])('%s 은 받지 않는다', (_label, trackingNumber) => {
    const r = registerShipmentSchema.safeParse({ ...ok, trackingNumber });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.trackingFormat');
  });

  it('비었으면 형식이 아니라 "적어 주세요" 라고 말한다', () => {
    const r = registerShipmentSchema.safeParse({ ...ok, trackingNumber: '   ' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.trackingRequired');
  });

  it.each(CARRIER_CODE)('%s 로 등록할 수 있다', (carrier) => {
    expect(registerShipmentSchema.safeParse({ carrier, trackingNumber: '123456789' }).success).toBe(true);
  });

  it('모르는 택배사는 받지 않는다', () => {
    expect(registerShipmentSchema.safeParse({ carrier: 'DHL', trackingNumber: '123456789' }).success).toBe(false);
  });
});
