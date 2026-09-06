import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  product: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { getAdminOrders } = await import('~/lib/queries/admin/orders');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

/** findMany 에 실제로 넘어간 where */
const whereOf = () => db.order.findMany.mock.calls[0]?.[0].where as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findMany.mockResolvedValue([]);
  db.order.count.mockResolvedValue(0);
});

describe('주문번호 검색', () => {
  it('완전한 번호는 정확히 일치로 던진다', async () => {
    await getAdminOrders(admin, { q: '20260831-8842713' });

    // 유니크 인덱스를 쓰려면 contains 가 아니라 값이어야 한다
    expect(whereOf()['orderNo']).toBe('20260831-8842713');
  });

  it('조각은 부분 일치로 던진다', async () => {
    await getAdminOrders(admin, { q: '8842713' });
    expect(whereOf()['orderNo']).toEqual({ contains: '8842713' });
  });

  it('이름은 대소문자를 가리지 않는다', async () => {
    await getAdminOrders(admin, { q: 'Demo' });
    expect(whereOf()['user']).toEqual({ name: { contains: 'Demo', mode: 'insensitive' } });
  });

  it('검색어가 없으면 조건을 붙이지 않는다', async () => {
    await getAdminOrders(admin, {});
    expect(whereOf()['orderNo']).toBeUndefined();
    expect(whereOf()['user']).toBeUndefined();
  });
});

describe('기간 검색', () => {
  it('시작만 주면 하한만 건다', async () => {
    await getAdminOrders(admin, { from: '2026-09-01' });
    expect(whereOf()['placedAt']).toEqual({ gte: new Date('2026-08-31T15:00:00.000Z') });
  });

  it('끝날을 포함한다', async () => {
    // 그날 00:00 으로 자르면 하루치가 조용히 사라진다
    await getAdminOrders(admin, { to: '2026-09-04' });
    expect(whereOf()['placedAt']).toEqual({ lt: new Date('2026-09-04T15:00:00.000Z') });
  });

  it('잘못된 날짜는 던진다 — 조용히 무시하면 다른 결과를 보고도 모른다', async () => {
    await expect(getAdminOrders(admin, { from: '2026-02-31' })).rejects.toThrow();
  });
});

describe('가맹점 범위', () => {
  it('검색을 얹어도 자기 주문 제한이 풀리지 않는다', async () => {
    // OR 로 얹으면 남의 주문이 나온다. 조건을 늘릴 때 가장 쉽게 깨지는 자리다.
    await getAdminOrders(merchant, { q: '홍길동' });

    const where = whereOf();
    expect(where['items']).toEqual({ some: { merchantId: 'm-a' } });
    expect(where['user']).toEqual({ name: { contains: '홍길동', mode: 'insensitive' } });
  });

  it('상태·검색·기간이 함께 걸린다', async () => {
    await getAdminOrders(merchant, {
      status: 'PAID', q: '20260831-8842713', from: '2026-09-01', to: '2026-09-04',
    });

    const where = whereOf();
    expect(where['status']).toBe('PAID');
    expect(where['orderNo']).toBe('20260831-8842713');
    expect(where['items']).toEqual({ some: { merchantId: 'm-a' } });
    expect(where['placedAt']).toEqual({
      gte: new Date('2026-08-31T15:00:00.000Z'),
      lt: new Date('2026-09-04T15:00:00.000Z'),
    });
  });

  it('전체 건수도 같은 조건으로 센다 — 다르면 쪽수가 어긋난다', async () => {
    await getAdminOrders(admin, { q: '8842713' });

    expect(db.order.count).toHaveBeenCalledWith({ where: whereOf() });
  });
});
