import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 재입고 대기자 수.
 *
 * **아무도 세지 않던 값이다.** 손님이 품절 옵션에 알림을 걸면 행이 쌓이고
 * `@@index([variantId, notifiedAt])` 까지 만들어 두었는데, 파는 쪽에는 그것을 볼
 * 창구가 없었다 — 무엇을 먼저 채울지 정하는 사람에게 가장 직접적인 숫자인데도.
 * 0 개인 옵션 둘 중 하나는 열두 명이 기다리고 하나는 아무도 안 기다린다.
 */

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminProducts, getAdminProductDetail } = await import('~/lib/queries/admin/products');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const variant = (stock: number, waiting: number, over: Record<string, unknown> = {}) => ({
  id: 'v-1', sku: 'SKU-1', label: '오트 / M', stock, isActive: true,
  _count: { restockAlerts: waiting },
  ...over,
});

const listRow = (variants: unknown[]) => ({
  id: 'p-1', slug: 'coat', name: '울 코트', listPrice: 100_000, salePrice: null,
  status: 'ACTIVE', createdAt: new Date('2026-08-01'),
  reviewRequestedAt: null, publishRejection: null, deletedAt: null, archivedBy: null,
  brand: { name: '무어' }, category: { name: '코트' },
  variants,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.count.mockResolvedValue(1);
});

describe('목록 — 상품마다 몇 명이 기다리는가', () => {
  it('옵션별 대기 인원을 상품 단위로 더한다', async () => {
    db.product.findMany.mockResolvedValue([
      listRow([variant(0, 7), variant(0, 5, { id: 'v-2' })]),
    ]);

    const { rows } = await getAdminProducts(admin, {});

    expect(rows[0]!.waitingRestock).toBe(12);
  });

  it('기다리는 사람이 없으면 0 이다', async () => {
    db.product.findMany.mockResolvedValue([listRow([variant(3, 0)])]);
    expect((await getAdminProducts(admin, {})).rows[0]!.waitingRestock).toBe(0);
  });

  it('이미 알림을 받은 건은 세지 않는다 — 그건 기다리는 상태가 아니다', async () => {
    db.product.findMany.mockResolvedValue([listRow([variant(0, 2)])]);

    await getAdminProducts(admin, {});

    const select = db.product.findMany.mock.calls[0]![0].select;
    expect(select.variants.select._count.select.restockAlerts).toEqual({
      where: { notifiedAt: null },
    });
  });
});

describe('상세 — 옵션마다 몇 명이 기다리는가', () => {
  it('재고를 적는 줄에 대기 인원이 함께 온다', async () => {
    db.product.findFirst.mockResolvedValue({
      id: 'p-1', slug: 'coat', name: '울 코트', description: '',
      listPrice: 100_000, salePrice: null, status: 'ACTIVE', publishRejection: null,
      brand: { id: 'b-1', name: '무어' }, category: { id: 'c-1', name: '코트' },
      variants: [variant(0, 12), variant(4, 0, { id: 'v-2', label: '오트 / L' })],
    });

    const detail = await getAdminProductDetail(admin, 'p-1');

    expect(detail!.variants.map((v) => [v.optionLabel, v.stock, v.waitingRestock])).toEqual([
      ['오트 / M', 0, 12],
      ['오트 / L', 4, 0],
    ]);
  });

  it('상세도 알림을 받은 건은 뺀다 — 목록과 같은 숫자여야 한다', async () => {
    db.product.findFirst.mockResolvedValue(null);

    await getAdminProductDetail(admin, 'p-1');

    const select = db.product.findFirst.mock.calls[0]![0].select;
    expect(select.variants.select._count.select.restockAlerts).toEqual({
      where: { notifiedAt: null },
    });
  });
});
