import { describe, it, expect } from 'vitest';
import {
  checkTemplate, renderTemplate, placeholdersOf, NOTIFICATION_PARAMS, NOTIFICATION_SAMPLE_PARAMS,
  NOTIFICATION_TEMPLATE_MAX, NOTIFICATION_KIND, hasPermission,
} from '../src';

/** 알림 문구 템플릿 — 운영이 말투를 고치되, 끼울 값은 코드가 정한다 */
describe('checkTemplate', () => {
  it('그 종류에 실리는 이름만 쓰면 문제없다', () => {
    expect(checkTemplate('RESTOCKED', '{productName} {optionLabel} 다시 들어왔어요')).toEqual([]);
    expect(checkTemplate('ORDER_SHIPPED', '배송이 시작됐어요')).toEqual([]); // 이름을 안 써도 된다
  });

  it('실리지 않는 이름은 무엇인지 말한다 — 알림에 없는 값을 부를 수 없다', () => {
    expect(checkTemplate('ORDER_SHIPPED', '{recipientPhone} 님, {orderNo} 출고')).toEqual([
      { kind: 'UNKNOWN_PLACEHOLDER', names: ['recipientPhone'] },
    ]);
    // 다른 종류에는 있는 이름이어도 이 종류에 없으면 안 된다
    expect(checkTemplate('COUPON_ISSUED', '{stock}개 남음')).toEqual([{ kind: 'UNKNOWN_PLACEHOLDER', names: ['stock'] }]);
  });

  it('닫지 않은 중괄호와 빈 문구, 너무 긴 문구를 잡는다', () => {
    expect(checkTemplate('ORDER_SHIPPED', '주문 {orderNo 출고')).toEqual([{ kind: 'BROKEN_BRACE' }]);
    expect(checkTemplate('ORDER_SHIPPED', '주문 orderNo} 출고')).toEqual([{ kind: 'BROKEN_BRACE' }]);
    expect(checkTemplate('ORDER_SHIPPED', '   ')).toEqual([{ kind: 'EMPTY' }]);
    expect(checkTemplate('ORDER_SHIPPED', 'a'.repeat(NOTIFICATION_TEMPLATE_MAX + 1))).toEqual([
      { kind: 'TOO_LONG', max: NOTIFICATION_TEMPLATE_MAX },
    ]);
  });
});

describe('renderTemplate', () => {
  it('값을 끼운다 — 같은 이름이 두 번이어도', () => {
    expect(renderTemplate('{orderNo} 출고 · {orderNo}', { orderNo: 'A-1' })).toBe('A-1 출고 · A-1');
  });

  it('쓰는 값이 하나라도 없거나 비었으면 null — 부르는 쪽이 기본 문구로 물러난다', () => {
    expect(renderTemplate('{productName} 문의에 답변', {})).toBeNull();
    expect(renderTemplate('{productName} 문의에 답변', { productName: '' })).toBeNull();
    expect(renderTemplate('문의에 답변이 달렸어요', {})).toBe('문의에 답변이 달렸어요');
  });

  it('값 안의 중괄호는 다시 풀지 않는다 — 상품 이름이 {orderNo} 여도 글자 그대로', () => {
    expect(renderTemplate('{productName} 재입고', { productName: '{orderNo}', orderNo: 'X' })).toBe('{orderNo} 재입고');
  });
});

describe('표', () => {
  it('모든 종류에 이름 목록이 있고, 미리보기 값이 그 이름을 전부 채운다', () => {
    for (const kind of NOTIFICATION_KIND) {
      const names: readonly string[] = NOTIFICATION_PARAMS[kind];
      expect(names.every((n) => n in NOTIFICATION_SAMPLE_PARAMS), kind).toBe(true);
      expect(renderTemplate(names.map((n) => `{${n}}`).join(' '), NOTIFICATION_SAMPLE_PARAMS), kind).not.toBeNull();
    }
    expect(placeholdersOf('{a} {b} {a}')).toEqual(['a', 'b']);
  });

  it('알림 문구는 운영진만 고친다 — 가맹점은 받는 쪽이다', () => {
    expect(hasPermission({ id: 'a', role: 'ADMIN', merchantId: null }, 'notification:write')).toBe(true);
    expect(hasPermission({ id: 's', role: 'SUPER_ADMIN', merchantId: null }, 'notification:write')).toBe(true);
    expect(hasPermission({ id: 'm', role: 'MERCHANT', merchantId: 'm-1' }, 'notification:write')).toBe(false);
  });
});
