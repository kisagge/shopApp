import { describe, it, expect } from 'vitest';
import {
  returnAudience, inquiryAudience, shipmentAudience, operatorRolesWith, canResolveReturnOf,
  CONSOLE_NOTIFICATION_KIND,
} from '../src';

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
    for (const kind of ['RETURN_REQUESTED', 'INQUIRY_RECEIVED', 'SUPPORT_INQUIRY_RECEIVED', 'MERCHANT_APPLIED', 'LATE_DEPOSIT_FOUND', 'ORDER_ADDRESS_CHANGED'] as const) {
      expect(CONSOLE_NOTIFICATION_KIND).toContain(kind);
    }
  });

  it('취소 뒤 입금의 두 소식은 돈을 보낸 손님의 알림함에 뜬다', () => {
    expect(CONSOLE_NOTIFICATION_KIND).not.toContain('LATE_DEPOSIT_RECEIVED');
    expect(CONSOLE_NOTIFICATION_KIND).not.toContain('LATE_DEPOSIT_REFUNDED');
  });
});

/**
 * 물건을 내보내는 사람.
 *
 * **반품과 다르다.** 반품은 여러 가맹점이 섞이면 운영진이 처리하지만, 출고는 가맹점마다 자기 줄을
 * 내보낸다 — 섞였다고 남의 몫이 되지 않는다.
 */
describe('출고하는 사람', () => {
  it('가맹점 줄이면 그 가맹점이 듣는다', () => {
    expect(shipmentAudience(['m-a'])).toEqual({ merchantIds: ['m-a'], operators: false });
  });

  it('섞이면 가맹점 전부가 듣는다 — 각자 자기 줄을 내보낸다', () => {
    expect(shipmentAudience(['m-b', 'm-a', 'm-a'])).toEqual({
      merchantIds: ['m-a', 'm-b'],
      operators: false,
    });
  });

  it('자사 줄이 있으면 운영진이 더해진다 — 그 줄을 내보내는 것은 운영진이다', () => {
    expect(shipmentAudience(['m-a', null])).toEqual({ merchantIds: ['m-a'], operators: true });
  });

  it('자사 줄만이면 운영진만 듣는다', () => {
    expect(shipmentAudience([null, null])).toEqual({ merchantIds: [], operators: true });
  });

  /** 반품은 섞이면 운영진 몫이다 — 두 규칙을 한 함수로 쓰면 한쪽이 틀린다 */
  it('반품과 규칙이 다르다', () => {
    expect(shipmentAudience(['m-a', 'm-b']).operators).toBe(false);
    expect(returnAudience(['m-a', 'm-b']).operators).toBe(true);
  });
});
