import { describe, it, expect } from 'vitest';
import { returnAudience, inquiryAudience, operatorRolesWith, canResolveReturnOf, CONSOLE_NOTIFICATION_KIND } from '../src';

/**
 * 처리할 일을 누가 듣는가.
 *
 * 운영 알림함에 처리할 일이 오지 않았다 — 반품을 신청하거나 문의를 남기거나 새 가맹점이 신청해도, 누군가 목록을
 * 열어 보기 전까지 아무도 몰랐다. 받는 사람은 그 일을 처리할 수 있는 사람이다.
 */

describe('반품·교환 신청', () => {
  it('한 가맹점의 줄뿐이면 그 가맹점만 듣는다 — 그 가맹점이 처리한다', () => {
    expect(returnAudience(['m-a', 'm-a'])).toEqual({ merchantIds: ['m-a'], operators: false });
  });

  it('판매처가 둘이면 각 가맹점과 운영진이 듣는다 — 처리는 운영진 몫이다', () => {
    expect(returnAudience(['m-b', 'm-a'])).toEqual({ merchantIds: ['m-a', 'm-b'], operators: true });
  });

  it('자사 상품 줄이 있으면 운영진이 듣는다', () => {
    expect(returnAudience([null])).toEqual({ merchantIds: [], operators: true });
    expect(returnAudience(['m-a', null])).toEqual({ merchantIds: ['m-a'], operators: true });
  });

  it('알림의 선이 처리 권한의 선과 같다 — 가맹점만 듣는 신청은 그 가맹점이 처리할 수 있다', () => {
    const merchant = { id: 'u', role: 'MERCHANT' as const, merchantId: 'm-a' };
    for (const lines of [['m-a'], ['m-a', 'm-a'], ['m-a', 'm-b'], ['m-a', null], [null]] as (string | null)[][]) {
      const audience = returnAudience(lines);
      const merchantAlone = !audience.operators && audience.merchantIds.includes('m-a');
      expect(merchantAlone, JSON.stringify(lines)).toBe(canResolveReturnOf(merchant, lines));
    }
  });
});

describe('상품 문의', () => {
  it('판매처가 있으면 그 가맹점이, 자사 상품이면 운영진이 듣는다', () => {
    expect(inquiryAudience('m-a')).toEqual({ merchantIds: ['m-a'], operators: false });
    expect(inquiryAudience(null)).toEqual({ merchantIds: [], operators: true });
  });
});

describe('권한을 가진 운영 역할', () => {
  it('권한표에서 뽑는다 — 입점 승인은 슈퍼관리자만, 반품 처리는 관리자도', () => {
    expect(operatorRolesWith('merchant:approve')).toEqual(['SUPER_ADMIN']);
    expect(operatorRolesWith('return:resolve')).toEqual(['ADMIN', 'SUPER_ADMIN']);
  });

  it('가맹점·손님은 권한이 있어도 넣지 않는다 — 가맹점은 자기 범위로 따로 받는다', () => {
    expect(operatorRolesWith('inquiry:answer')).not.toContain('MERCHANT');
    expect(operatorRolesWith('order:read')).not.toContain('CUSTOMER');
  });
});

describe('알림함', () => {
  it('처리할 일은 운영 알림함에 뜬다', () => {
    for (const kind of ['RETURN_REQUESTED', 'INQUIRY_RECEIVED', 'SUPPORT_INQUIRY_RECEIVED', 'MERCHANT_APPLIED'] as const) {
      expect(CONSOLE_NOTIFICATION_KIND).toContain(kind);
    }
  });
});
