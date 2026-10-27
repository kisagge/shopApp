import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ORDER_STATUS, PARTIAL_CANCELLABLE_STATUS } from '@shop/core';

/**
 * 일부 취소의 관문을 화면과 창구가 **같은 목록으로** 본다.
 *
 * README 에 적힌 고장이다 — 예전에는 일부 취소 단추가 **서버의 목록을 베껴 적어** 두었고, 그래서 둘이 갈렸다.
 * 목록을 core 로 올려(`PARTIAL_CANCELLABLE_STATUS`) 한 곳에서 읽게 고쳤는데, **그 고침을 지키는 것이
 * 아무것도 없었다.**
 *
 * 갈리면 양쪽으로 조용하다.
 *
 * - **화면이 넓게 적으면** 단추가 떠 있고 눌러 본 뒤에야 안 된다는 것을 안다.
 * - **화면이 좁게 적으면** 할 수 있는 일을 못 한다 — 운영진은 기능이 없는 줄 안다.
 *
 * 값이 맞는지는 core 의 `order-state` 검사가 전수로 본다. 여기서 보는 것은 **베끼지 않았는가**다.
 */

const ROOT = resolve(import.meta.dirname, '..');

/** 이 관문을 함께 쓰는 두 자리 — 단추를 세우는 쪽과 막는 쪽 */
const SIDES = {
  화면: 'src/app/admin/orders/[orderNo]/page.tsx',
  창구: 'src/lib/orders/cancel-items.ts',
} as const;

const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

/** 소스에 적힌 주문 상태 배열 리터럴 — `['PAID', 'PREPARING']` 같은 것 */
function statusLiterals(source: string): string[][] {
  const found: string[][] = [];
  for (const m of source.matchAll(/\[(\s*'[A-Z_]+'\s*(?:,\s*'[A-Z_]+'\s*)*),?\s*\]/g)) {
    const names = [...m[1]!.matchAll(/'([A-Z_]+)'/g)].map(([, n]) => n!);
    if (names.every((n) => (ORDER_STATUS as readonly string[]).includes(n))) found.push(names);
  }
  return found;
}

describe('두 자리가 같은 목록을 본다', () => {
  it.each(Object.entries(SIDES))('%s 가 core 의 목록을 들여온다', (_label, path) => {
    const source = read(path);

    expect(source).toContain('PARTIAL_CANCELLABLE_STATUS');
    expect(source, '@shop/core 에서 들여와야 한다 — 옆에 다시 적으면 갈린다').toMatch(
      /import[\s\S]*?PARTIAL_CANCELLABLE_STATUS[\s\S]*?from '@shop\/core'/,
    );
  });

  it('읽은 파일이 실제로 그 파일이다 — 경로가 틀리면 위 단정이 헛돈다', () => {
    // 화면이 옮겨지거나 이름이 바뀌면 readFileSync 가 던지고, 그때 이 검사가 길을 알려 준다
    expect(read(SIDES.화면)).toContain('canCancelItems');
    expect(read(SIDES.창구)).toContain('assertCancellable');
  });

  it('창구가 적어 둔 상태 목록은 손님용 하나뿐이다', () => {
    /*
     * **들여오는 것만으로는 모자란다.** 쓰는 자리를 리터럴로 바꿔 놓아도 들여오기 줄은 그대로 남아,
     * "core 에서 가져온다" 는 단정이 통과한다 — 실제로 그렇게 바꿔 보고 이 검사를 더했다.
     *
     * 그래서 **적힌 목록을 센다.** 창구에 있어야 할 상태 목록은 손님용(CUSTOMER_PARTIAL) 하나다.
     * 운영진 몫을 옆에 다시 적으면 둘이 되어 여기서 걸린다.
     */
    expect(
      statusLiterals(read(SIDES.창구)),
      '창구에 상태 목록이 하나 더 적혀 있다. 운영진 몫은 core 의 목록을 쓴다',
    ).toEqual([['PAID']]);
  });

  it('화면은 상태 목록을 스스로 적지 않는다', () => {
    /*
     * 베낀 목록이 다시 생기는 가장 흔한 길이다 — 창구를 고치면서 화면을 잊는다.
     * 화면은 어느 상태가 취소 가능한지 **판단하지 않고** core 에 묻기만 한다.
     */
    expect(
      statusLiterals(read(SIDES.화면)),
      '화면에 주문 상태 목록이 적혀 있다. core 의 목록을 들여와 쓴다',
    ).toEqual([]);
  });
});

describe('손님 목록과 운영진 목록', () => {
  /**
   * 창구에는 손님용 목록이 따로 있다(`CUSTOMER_PARTIAL`). 그쪽이 더 넓으면 **손님이 운영진보다 많이
   * 취소할 수 있다** — 배송 준비가 시작된 주문을 손님이 혼자 깨뜨릴 수 있게 된다.
   *
   * 값이 맞는지는 `cancel-items` 검사가 행동으로 본다. 여기서는 **두 목록의 관계**를 본다.
   */
  const customerList = (): string[] => {
    const m = /const CUSTOMER_PARTIAL[^=]*=\s*(\[[^\]]*\])/.exec(read(SIDES.창구));
    expect(m, 'CUSTOMER_PARTIAL 의 모양이 바뀌었다 — 이 검사의 읽는 법을 함께 고친다').not.toBeNull();
    return [...m![1]!.matchAll(/'([A-Z_]+)'/g)].map(([, n]) => n!);
  };

  it('손님 목록을 읽어 냈다', () => {
    // 못 읽으면 아래 단정이 빈 목록을 통과시킨다
    expect(customerList().length).toBeGreaterThan(0);
  });

  it('손님 목록은 운영진 목록 안에 있다', () => {
    expect(customerList().filter((s) => !PARTIAL_CANCELLABLE_STATUS.includes(s as never))).toEqual([]);
  });

  it('적힌 것이 전부 실제 주문 상태다 — 오타는 조용히 아무것도 막지 않는다', () => {
    expect(customerList().filter((s) => !(ORDER_STATUS as readonly string[]).includes(s))).toEqual([]);
  });
});
