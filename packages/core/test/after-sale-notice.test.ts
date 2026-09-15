import { describe, it, expect } from 'vitest';
import {
  AFTER_SALE_KIND, MAIL_TEMPLATE_KIND, MAIL_TEMPLATE_PARAMS, NOTIFICATION_KIND, NOTIFICATION_PARAMS,
  afterSaleByOf, recordsNotification, showsReason,
} from '../src';

describe('afterSaleByOf', () => {
  it('배치면 system, 주문한 사람이면 customer, 아니면 staff', () => {
    expect(afterSaleByOf({ actorId: 'cron', customerId: 'u-1', system: true })).toBe('system');
    expect(afterSaleByOf({ actorId: 'u-1', customerId: 'u-1', system: false })).toBe('customer');
    expect(afterSaleByOf({ actorId: 'u-admin', customerId: 'u-1', system: false })).toBe('staff');
  });
});

describe('알림함에 남기는가', () => {
  it('손님이 스스로 한 일은 남기지 않고, 남이 한 일은 남긴다', () => {
    expect(recordsNotification('customer')).toBe(false);
    expect(recordsNotification('staff')).toBe(true);
    expect(recordsNotification('system')).toBe(true);
  });
});

describe('사유를 보여 주는가', () => {
  it('운영진의 취소 메모는 손님에게 쓴 말이 아니다', () => {
    expect(showsReason('ORDER_CANCELLED', 'staff')).toBe(false);
    expect(showsReason('ORDER_CANCELLED', 'customer')).toBe(true);
    expect(showsReason('ORDER_CANCELLED', 'system')).toBe(true);
  });

  it('반려 사유는 늘, 승인·환불에는 사유 칸이 없다', () => {
    expect(showsReason('RETURN_REJECTED', 'staff')).toBe(true);
    expect(showsReason('RETURN_APPROVED', 'staff')).toBe(false);
    expect(showsReason('REFUND_COMPLETED', 'staff')).toBe(false);
  });
});

describe('종류 목록', () => {
  it('넷 다 알림 종류이자 메일 종류이고, 끼울 값은 알림은 주문번호, 메일은 제목에 주문번호·첫 문장에 이름이다', () => {
    for (const kind of AFTER_SALE_KIND) {
      expect(NOTIFICATION_KIND).toContain(kind);
      expect(MAIL_TEMPLATE_KIND).toContain(kind);
      expect(NOTIFICATION_PARAMS[kind]).toEqual(['orderNo']);
      expect(MAIL_TEMPLATE_PARAMS[kind]).toEqual({ subject: ['orderNo'], heading: [], lead: ['name'] });
    }
  });
});
