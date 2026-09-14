import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * 주문 생성 창구가 이용 정지를 DB 에서 다시 보는가.
 *
 * 정지하면 세션을 지우지만 세션 쿠키 캐시(5분)는 DB 를 안 보고 통과시킨다. 그 틈에 재고를 묶는 주문이
 * 만들어지면 안 된다. 창구가 검사를 빠뜨리거나 **주문을 만든 뒤에** 보면 막은 것이 아니다.
 */
const source = readFileSync(resolve(import.meta.dirname, '../src/app/api/orders/route.ts'), 'utf8');

describe('주문 창구의 이용 정지 검사', () => {
  it('isSuspended 를 부르고, 그 자리가 createOrder 보다 앞이다', () => {
    const check = source.indexOf('await isSuspended(sessionUser.id)');
    const create = source.indexOf('await createOrder(');
    expect(check, '주문 창구가 정지를 보지 않는다').toBeGreaterThan(-1);
    expect(check).toBeLessThan(create);
  });

  it('막을 때 로그인 화면과 같은 코드를 쓴다', () => {
    expect(source).toContain("code: 'ACCOUNT_SUSPENDED'");
  });
});
