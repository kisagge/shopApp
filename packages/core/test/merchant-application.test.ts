import { describe, it, expect } from 'vitest';
import {
  isBusinessNumber, normalizeBusinessNumber, canApplyAsMerchant, brandSlugOf,
  MERCHANT_APPLICATION_ERROR, MERCHANT_STATUS, MERCHANT_STATUS_LABEL,
  isOpenApplication, merchantStatusNeedsReason, nextMerchantStatuses, canMoveMerchantTo,
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

describe('반려는 해지와 다르다', () => {
  /*
   * **한동안 반려라는 상태가 없어서 해지를 대신 쓰고 있었다.** 그래서 한 번도
   * 승인된 적 없는 신청이 "해지" 로 적혔고, 나중에 읽는 사람은 이 가맹점이
   * 장사를 하다 그만둔 것인지 애초에 들어온 적이 없는 것인지 가릴 수 없었다.
   */
  it('둘 다 끝난 것이라 다시 신청할 수 있다', () => {
    expect(isOpenApplication('REJECTED')).toBe(false);
    expect(isOpenApplication('TERMINATED')).toBe(false);
  });

  it('심사 중·정상·정지는 살아 있는 신청이다 — 다시 낼 수 없다', () => {
    for (const s of ['PENDING', 'APPROVED', 'SUSPENDED'] as const) {
      expect(isOpenApplication(s), s).toBe(true);
    }
  });

  it('모든 상태에 이름이 붙어 있다', () => {
    for (const s of MERCHANT_STATUS) {
      expect(MERCHANT_STATUS_LABEL[s], s).toBeTruthy();
    }
  });
});

describe('사유가 필요한 처분', () => {
  it('불이익을 주는 처분에는 이유를 남긴다', () => {
    for (const s of ['REJECTED', 'SUSPENDED', 'TERMINATED'] as const) {
      expect(merchantStatusNeedsReason(s), s).toBe(true);
    }
  });

  it('승인과 심사 중에는 이유가 없어도 된다', () => {
    expect(merchantStatusNeedsReason('APPROVED')).toBe(false);
    expect(merchantStatusNeedsReason('PENDING')).toBe(false);
  });
});

describe('갈 수 있는 곳', () => {
  it('심사 중인 신청은 승인하거나 반려한다', () => {
    expect([...nextMerchantStatuses('PENDING')]).toEqual(['APPROVED', 'REJECTED']);
  });

  it('장사하던 가맹점은 반려할 수 없다 — 그건 해지다', () => {
    expect(canMoveMerchantTo('APPROVED', 'REJECTED')).toBe(false);
    expect(canMoveMerchantTo('APPROVED', 'TERMINATED')).toBe(true);
  });

  it('심사 중인 신청은 정지·해지할 수 없다 — 그건 반려다', () => {
    expect(canMoveMerchantTo('PENDING', 'SUSPENDED')).toBe(false);
    expect(canMoveMerchantTo('PENDING', 'TERMINATED')).toBe(false);
  });

  it('정지된 가맹점은 되살리거나 해지한다', () => {
    expect(canMoveMerchantTo('SUSPENDED', 'APPROVED')).toBe(true);
    expect(canMoveMerchantTo('SUSPENDED', 'TERMINATED')).toBe(true);
  });

  it('끝난 줄은 아무 데도 가지 않는다 — 되살리면 그때의 판단이 지워진다', () => {
    for (const from of ['REJECTED', 'TERMINATED'] as const) {
      expect([...nextMerchantStatuses(from)], from).toEqual([]);
    }
  });

  it('갈 수 있는 곳은 모두 아는 상태다', () => {
    // 목록에 없는 값이 섞이면 화면이 이름 없는 선택지를 그린다
    for (const from of MERCHANT_STATUS) {
      for (const to of nextMerchantStatuses(from)) {
        expect(MERCHANT_STATUS.includes(to), `${from} → ${to}`).toBe(true);
      }
    }
  });
});
