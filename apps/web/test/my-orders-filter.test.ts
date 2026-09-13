import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readDateRange, readMyOrderSearch } from '@shop/core';

/**
 * 내 주문 목록을 좁히는 조건.
 *
 * **주문이 쌓이면 목록은 쓸모가 없어진다.** 이 화면은 스무 건만 보여 주고
 * 넘길 길이 없어서, 스물한 번째 주문부터는 주소로도 못 간다 — "작년에 산
 * 그 코트" 를 찾는 길이 아예 없었다.
 *
 * 조건이 실제로 쿼리에 붙는지 여기서 본다. 화면 검사는 "결과가 줄었다" 까지만
 * 말해 주는데, **아무 조건이나 붙여도 줄어든다.**
 */

const findMany = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({ prisma: { order: { findMany } } }));
vi.mock('~/lib/grade/effective', () => ({ getEffectiveGrade: vi.fn() }));

const { getMyOrders } = await import('~/lib/queries/mypage');

/** 마지막 호출의 where */
const lastWhere = (): Record<string, any> => findMany.mock.calls.at(-1)![0].where;

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
});

describe('내 주문 좁히기', () => {
  it('언제나 자기 주문만 본다', async () => {
    /*
     * **조건을 더하다 이것을 놓치면 남의 주문이 보인다.** 검색·기간이
     * 어떤 모양이든 userId 는 빠질 수 없다.
     */
    await getMyOrders('u-1', { search: readMyOrderSearch('코트') });
    expect(lastWhere()['userId']).toBe('u-1');
  });

  it('완전한 주문번호는 정확히 일치로 찾는다', async () => {
    // 유니크 인덱스를 쓰는 갈래다. 부분 일치로 던지면 전체를 훑는다.
    await getMyOrders('u-1', { search: readMyOrderSearch('20260831-8842713') });
    expect(lastWhere()['orderNo']).toBe('20260831-8842713');
  });

  it('뒷자리만 적으면 번호의 일부로 찾는다', async () => {
    await getMyOrders('u-1', { search: readMyOrderSearch('8842713') });
    expect(lastWhere()['orderNo']).toEqual({ contains: '8842713' });
  });

  it('상품명은 주문 항목의 스냅샷에서 찾는다', async () => {
    /*
     * **지금 상품 이름이 아니라 살 때 찍힌 이름이다.** 그 사이에 이름이
     * 바뀌었어도 사람이 기억하는 것은 그때 이름이고, 주문은 애초에 그 값을
     * 안고 있다. 상품 표를 조인해 찾으면 이름이 바뀐 순간 과거가 사라진다.
     */
    await getMyOrders('u-1', { search: readMyOrderSearch('울 코트') });
    expect(lastWhere()['items']).toEqual({
      some: { productName: { contains: '울 코트', mode: 'insensitive' } },
    });
  });

  it('검색어가 없으면 아무 조건도 붙이지 않는다', async () => {
    // 빈 조건을 붙이면 아무것도 안 나오는 목록이 된다
    await getMyOrders('u-1', { search: readMyOrderSearch('   ') });
    const where = lastWhere();
    expect(where['orderNo']).toBeUndefined();
    expect(where['items']).toBeUndefined();
  });

  it('기간은 끝날을 포함한다', async () => {
    /*
     * 9월 4일까지라고 적었으면 9월 4일 주문이 나와야 한다. 받은 값을 그대로
     * 상한으로 쓰면 그날 하루가 조용히 빠지는데, 아무도 알아채지 못한다.
     */
    await getMyOrders('u-1', { range: readDateRange('2026-09-01', '2026-09-04') });
    const placed = lastWhere()['placedAt'];

    expect(placed.gte.toISOString()).toBe('2026-08-31T15:00:00.000Z'); // 9/1 00:00 KST
    expect(placed.lt.toISOString()).toBe('2026-09-04T15:00:00.000Z'); // 9/5 00:00 KST
  });

  it('한쪽만 적어도 된다', async () => {
    await getMyOrders('u-1', { range: readDateRange('2026-09-01', undefined) });
    const placed = lastWhere()['placedAt'];
    expect(placed.gte).toBeInstanceOf(Date);
    expect(placed.lt).toBeUndefined();
  });

  it('기간이 비면 날짜 조건이 없다', async () => {
    await getMyOrders('u-1', { range: readDateRange(undefined, undefined) });
    expect(lastWhere()['placedAt']).toBeUndefined();
  });

  it('상태·검색·기간이 함께 걸린다', async () => {
    /*
     * **하나가 다른 하나를 지우면 안 된다.** 탭으로 좁혀 놓고 검색하면 그
     * 탭이 풀리는 것이 가장 흔한 실망이다.
     */
    await getMyOrders('u-1', {
      statuses: ['DELIVERED'],
      search: readMyOrderSearch('코트'),
      range: readDateRange('2026-09-01', '2026-09-04'),
    });

    const where = lastWhere();
    expect(where['status']).toEqual({ in: ['DELIVERED'] });
    expect(where['items']).toBeDefined();
    expect(where['placedAt']).toBeDefined();
    expect(where['userId']).toBe('u-1');
  });
});
