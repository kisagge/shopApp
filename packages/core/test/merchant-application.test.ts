import { describe, it, expect } from 'vitest';
import {
  isBusinessNumber, normalizeBusinessNumber, canApplyAsMerchant, brandSlugOf,
  MERCHANT_APPLICATION_ERROR,
} from '../src/merchant-application';

describe('사업자등록번호', () => {
  it('하이픈이 없어도 받아 표준 표기로 맞춘다', () => {
    // 하이픈을 빼고 적는 사람이 많다. 거절할 이유가 없다.
    expect(normalizeBusinessNumber('0000000001')).toBe('000-00-00001');
    expect(normalizeBusinessNumber('000 00 00001')).toBe('000-00-00001');
    expect(isBusinessNumber('0000000001')).toBe(true);
  });

  it('이미 맞는 표기는 그대로 둔다', () => {
    expect(normalizeBusinessNumber('123-45-67890')).toBe('123-45-67890');
  });

  it('자릿수가 다르면 거절한다', () => {
    expect(isBusinessNumber('123-45-6789')).toBe(false);
    expect(isBusinessNumber('12345678901')).toBe(false);
    expect(isBusinessNumber('')).toBe(false);
  });

  it('숫자가 아닌 것이 섞이면 거절한다', () => {
    expect(isBusinessNumber('abc-de-fghij')).toBe(false);
  });

  it('시드가 쓰는 자리표시자도 형식은 맞다', () => {
    // 형식만 보므로 통과해야 한다. 진짜인지는 여기서 알 수 없다.
    expect(isBusinessNumber('000-00-00001')).toBe(true);
  });
});

describe('누가 신청할 수 있는가', () => {
  it('고객만 신청한다', () => {
    expect(canApplyAsMerchant('CUSTOMER')).toBe(true);
  });

  it('가맹점은 이미 계정이 있다', () => {
    expect(canApplyAsMerchant('MERCHANT')).toBe(false);
  });

  it('운영진은 신청하지 않는다 — 심사하는 사람과 받는 사람이 같아진다', () => {
    expect(canApplyAsMerchant('ADMIN')).toBe(false);
    expect(canApplyAsMerchant('SUPER_ADMIN')).toBe(false);
  });
});

describe('브랜드 슬러그', () => {
  it('공백과 대문자를 정리한다', () => {
    expect(brandSlugOf('STUDIO NOON')).toBe('studio-noon');
    expect(brandSlugOf('  Atelier   K  ')).toBe('atelier-k');
  });

  it('연속된 기호를 하나로 줄이고 양끝을 떤다', () => {
    expect(brandSlugOf('--Moor & Co.--')).toBe('moor-co');
  });

  it('한글만 있으면 빈 문자열이다', () => {
    /*
     * 여기서 임의로 지어내면 어디서 온 주소인지 알 수 없는 값이 생긴다.
     * 부르는 쪽이 대체 값을 정하게 둔다.
     */
    expect(brandSlugOf('스튜디오눈')).toBe('');
  });
});

describe('오류 문구', () => {
  it('모든 코드에 사람이 읽는 문구가 있다', () => {
    for (const [code, message] of Object.entries(MERCHANT_APPLICATION_ERROR)) {
      expect(message, code).toBeTruthy();
    }
  });
});
