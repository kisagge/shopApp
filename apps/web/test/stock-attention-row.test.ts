import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LOW_STOCK_THRESHOLD, type Actor } from '@shop/core';

/**
 * 상품 목록의 재고 칸 — **어느 옵션이 손이 필요한가.**
 *
 * **합계만 적혀 있었다.** 옵션이 여덟인 상품에서 하나가 품절이면 합계(`totalStock`)는 멀쩡하고
 * 임박 표시도 없다 — 그런데 그 상품은 품절 탭에 뜬다(stockAttentionWhere: 옵션 하나라도 걸리면
 * 그 상품이 뜬다). 대시보드의 "품절 3개" 를 눌러 들어온 운영자는 멀쩡해 보이는 세 줄을 보고,
 * **그 줄이 왜 거기 있는지** 알 수 없다. 쿠폰의 "지정 3개" 와 같은 고장이다.
 */

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminProducts } = await import('~/lib/queries/admin/products');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const variant = (label: string, stock: number, waiting = 0) => ({
  label, stock, _count: { restockAlerts: waiting },
});

const listRow = (variants: unknown[]) => ({
  id: 'p-1', slug: 'coat', name: '울 코트', listPrice: 100_000, salePrice: null,
  status: 'ACTIVE', createdAt: new Date('2026-08-01'),
  reviewRequestedAt: null, publishRejection: null, deletedAt: null, archivedBy: null,
  brand: { name: '무어' }, category: { name: '코트' },
  variants,
});

const attention = async (variants: unknown[]) => {
  db.product.findMany.mockResolvedValue([listRow(variants)]);
  const { rows } = await getAdminProducts(admin, {});
  return rows[0]!.stockAttention;
};

beforeEach(() => {
  vi.clearAllMocks();
  db.product.count.mockResolvedValue(1);
});

describe('무엇을 담는가', () => {
  /** 이것이 고장의 핵심이다 — 합계가 멀쩡한 상품의 품절 옵션 */
  it('합계가 넉넉해도 품절 옵션을 담는다', async () => {
    const got = await attention([variant('오트 / S', 0), variant('오트 / M', 40)]);

    expect(got).toEqual([{ label: '오트 / S', stock: 0, level: 'OUT', waiting: 0 }]);
  });

  it('임박 옵션을 담는다 — 기준은 core 가 정한다', async () => {
    const got = await attention([variant('오트 / M', LOW_STOCK_THRESHOLD)]);

    expect(got).toEqual([
      { label: '오트 / M', stock: LOW_STOCK_THRESHOLD, level: 'LOW', waiting: 0 },
    ]);
  });

  it('기준보다 하나 많으면 담지 않는다', async () => {
    expect(await attention([variant('오트 / M', LOW_STOCK_THRESHOLD + 1)])).toEqual([]);
  });

  it('넉넉한 옵션만이면 빈 목록이다 — 멀쩡한 줄에는 아무 말도 하지 않는다', async () => {
    expect(await attention([variant('오트 / M', 40), variant('오트 / L', 30)])).toEqual([]);
  });

  /** 0 인 옵션 둘 중 하나는 열두 명이 기다리고 하나는 아무도 안 기다린다 */
  it('기다리는 사람을 옵션마다 센다', async () => {
    const got = await attention([variant('오트 / S', 0, 12), variant('오트 / L', 0, 0)]);

    expect(got.map((v) => [v.label, v.waiting])).toEqual([
      ['오트 / L', 0],
      ['오트 / S', 12],
    ]);
  });
});

/**
 * **급한 것부터.** 줄에는 앞의 둘만 적으므로 순서가 곧 눈에 들어오는 것이다 — 품절이 끝줄에
 * 있으면 아무도 못 본다.
 */
describe('세우는 순서', () => {
  it('품절이 임박보다 먼저다', async () => {
    const got = await attention([variant('오트 / M', 2), variant('오트 / S', 0)]);

    expect(got.map((v) => v.level)).toEqual(['OUT', 'LOW']);
  });

  it('같은 급이면 남은 것이 적은 쪽이 먼저다', async () => {
    const got = await attention([variant('오트 / M', 4), variant('오트 / L', 1)]);

    expect(got.map((v) => v.stock)).toEqual([1, 4]);
  });

  /** 같은 상품이 볼 때마다 다른 순서로 서면 비교할 수가 없다 */
  it('남은 것도 같으면 이름 순이다', async () => {
    const got = await attention([variant('오트 / L', 0), variant('오트 / M', 0), variant('검정 / S', 0)]);

    expect(got.map((v) => v.label)).toEqual(['검정 / S', '오트 / L', '오트 / M']);
  });
});

/**
 * **거는 쪽과 적는 쪽이 같은 경계를 본다.** 품절 탭은 조회 조건으로 상품을 고르고
 * (stockAttentionWhere), 줄은 여기서 옵션을 고른다 — 두 경계가 어긋나면 탭에는 떴는데 줄에는
 * 아무 표시가 없는 상품이 생긴다. 바로 이번에 고친 그 모양이다.
 */
describe('탭이 고르는 경계와 같다', () => {
  it('품절 탭에 뜨는 상품은 줄에도 품절 옵션이 보인다', async () => {
    const got = await attention([variant('오트 / S', 0), variant('오트 / M', 40)]);

    expect(got.some((v) => v.level === 'OUT')).toBe(true);
  });

  it('임박 탭에 뜨는 상품은 줄에도 임박 옵션이 보인다', async () => {
    const got = await attention([variant('오트 / S', LOW_STOCK_THRESHOLD), variant('오트 / M', 40)]);

    expect(got.some((v) => v.level === 'LOW')).toBe(true);
  });

  /** 활성 옵션만 묻는다 — 내려 둔 옵션의 품절은 할 일이 아니다 */
  it('꺼 둔 옵션은 조회가 아예 안 가져온다', async () => {
    await attention([variant('오트 / M', 40)]);

    expect(db.product.findMany.mock.calls[0]![0].select.variants.where).toEqual({ isActive: true });
  });
});
