import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RETURN_STAGE, RETURN_STATUS, returnStageOf, type Actor } from '@shop/core';

/**
 * 반품·교환 처리 대기열 조회 — 범위, 단계 조건이 단계 판정과 같은 갈래인지, 순서, 내 차례, 기다린 날.
 */

const db = vi.hoisted(() => ({
  returnRequest: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getReturnQueue, stageWhere, RETURN_QUEUE_VIEW } = await import('~/lib/queries/admin/returns');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const NOW = new Date('2026-09-15T12:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', type: 'RETURN', reason: 'DEFECTIVE', status: 'REQUESTED', itemIds: ['i-1'], receivedAt: null,
  requestedAt: new Date('2026-09-11T12:00:00Z'), resolvedAt: null,
  order: {
    orderNo: '20260911-0000001', user: { name: '김손님' },
    items: [
      { id: 'i-1', productName: '울 코트', merchantId: 'm-a', status: 'RETURN_REQUESTED' },
      { id: 'i-2', productName: '니트', merchantId: 'm-b', status: 'DELIVERED' },
    ],
  },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.returnRequest.findMany.mockResolvedValue([row()]);
  db.returnRequest.count.mockResolvedValue(0);
});

/** 조회 조건이 한 신청을 고르는가 — prisma 의 where 를 여기서 흉내 낸다(쓰는 연산만) */
function matches(where: Record<string, any>, r: { type: string; status: string; receivedAt: Date | null }): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = (r as any)[key];
    if (cond === null) return value === null;
    if (typeof cond !== 'object') return value === cond;
    if ('in' in cond) return cond.in.includes(value);
    if ('notIn' in cond) return !cond.notIn.includes(value);
    if ('not' in cond) return cond.not === null ? value !== null : value !== cond.not;
    throw new Error(`모르는 조건 ${key}`);
  });
}

describe('단계 조건', () => {
  /**
   * **상태를 손으로 적은 검사는 같은 칸을 또 빠뜨린다.**
   *
   * 여기 목록에 철회(CANCELLED)가 없어서, 조회가 "끝난 것 = 완료·반려" 로 적어 둔 것을 이 검사가
   * 그대로 통과시켰다 — 무른 신청은 어느 탭에도 뜨지 않았다. 상태는 core 의 목록에서 받는다:
   * 상태가 늘면 표본도 함께 는다.
   */
  it('각 단계의 조회 조건이 core 의 단계 판정과 같은 신청을 고른다 — 둘이 갈리면 탭 수와 줄의 단계가 어긋난다', () => {
    const samples = [];
    for (const type of ['RETURN', 'EXCHANGE']) for (const status of RETURN_STATUS)
      for (const receivedAt of [null, NOW]) samples.push({ type, status, receivedAt });
    for (const stage of RETURN_STAGE) {
      for (const s of samples) expect(matches(stageWhere(stage), s), `${stage} ${JSON.stringify(s)}`).toBe(returnStageOf(s) === stage);
    }
    for (const s of samples) expect(matches(stageWhere('OPEN'), s)).toBe(returnStageOf(s) !== 'DONE');
  });

  /**
   * **무른 신청이 어느 탭에도 없었다.** 운영진이 승인을 무른 것(철회)도, 손님이 취소한 것도 끝난
   * 것인데, 조회가 "완료·반려" 만 적어 두어 조용히 사라졌다 — 운영자는 "그 신청 어디 갔지" 를 묻게 되고,
   * 그 사이 교환으로 잡았다 푼 재고의 자취도 대기열에서는 보이지 않는다.
   */
  it('철회된 신청도 "끝난 것" 에 선다', () => {
    const withdrawn = { type: 'RETURN', status: 'CANCELLED', receivedAt: null };

    expect(returnStageOf(withdrawn)).toBe('DONE');
    expect(matches(stageWhere('DONE'), withdrawn), '끝난 것에 없다').toBe(true);
    expect(matches(stageWhere('OPEN'), withdrawn), '진행 중으로 잡힌다').toBe(false);
  });
});

describe('getReturnQueue', () => {
  it('손님은 볼 수 없다', async () => {
    await expect(getReturnQueue(customer)).rejects.toThrow();
  });

  it('가맹점은 자기 상품이 든 주문의 신청만 — 목록과 탭 수 모두', async () => {
    await getReturnQueue(merchant, { view: 'REVIEW' }, NOW);
    expect(db.returnRequest.findMany.mock.calls[0]?.[0].where).toEqual({ order: { items: { some: { merchantId: 'm-a' } } }, status: 'REQUESTED' });
    for (const call of db.returnRequest.count.mock.calls) expect(call[0].where.order).toEqual({ items: { some: { merchantId: 'm-a' } } });
    expect(db.returnRequest.count).toHaveBeenCalledTimes(RETURN_QUEUE_VIEW.length);
  });

  it('진행 중은 오래 기다린 것부터, 끝난 것은 최근에 끝난 것부터', async () => {
    await getReturnQueue(admin, {}, NOW);
    expect(db.returnRequest.findMany.mock.calls[0]?.[0].orderBy).toEqual([{ requestedAt: 'asc' }, { id: 'asc' }]);
    await getReturnQueue(admin, { view: 'DONE' }, NOW);
    expect(db.returnRequest.findMany.mock.calls[1]?.[0].orderBy).toEqual([{ resolvedAt: 'desc' }, { id: 'desc' }]);
  });

  it('종류 필터를 목록과 탭 수에 함께 건다', async () => {
    await getReturnQueue(admin, { type: 'EXCHANGE' }, NOW);
    expect(db.returnRequest.findMany.mock.calls[0]?.[0].where).toMatchObject({ type: 'EXCHANGE' });
    expect(db.returnRequest.count.mock.calls[0]?.[0].where).toMatchObject({ type: 'EXCHANGE' });
  });

  it('줄마다 단계·신청한 줄의 상품·기다린 날·내 차례를 붙인다', async () => {
    const page = await getReturnQueue(merchant, {}, NOW);
    expect(page.rows[0]).toMatchObject({ stage: 'REVIEW', productNames: ['울 코트'], waitingDays: 4, myTurn: true, customerName: '김손님' });
  });

  it('남의 상품이 섞인 신청은 가맹점 차례가 아니고, 물건이 온 반품은 운영진(환불) 차례다', async () => {
    db.returnRequest.findMany.mockResolvedValue([row({ itemIds: ['i-1', 'i-2'] })]);
    expect((await getReturnQueue(merchant, {}, NOW)).rows[0]?.myTurn).toBe(false);

    db.returnRequest.findMany.mockResolvedValue([row({ status: 'APPROVED', receivedAt: NOW })]);
    expect((await getReturnQueue(merchant, {}, NOW)).rows[0]).toMatchObject({ stage: 'REFUND', myTurn: false });
    expect((await getReturnQueue(admin, {}, NOW)).rows[0]).toMatchObject({ stage: 'REFUND', myTurn: true });
  });

  it('끝난 신청에는 기다린 날이 없다', async () => {
    db.returnRequest.findMany.mockResolvedValue([row({ id: 'a', status: 'COMPLETED', resolvedAt: NOW })]);
    const page = await getReturnQueue(admin, { view: 'DONE', take: 1 }, NOW);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]?.waitingDays).toBeNull();
  });
});
