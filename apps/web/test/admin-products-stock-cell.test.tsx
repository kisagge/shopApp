// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { won, LOW_STOCK_THRESHOLD, type Actor } from '@shop/core';

/**
 * 상품 목록의 **재고 칸** — 합계만 적혀 있었다.
 *
 * 옵션이 여덟인 상품에서 하나가 품절이면 합계는 멀쩡해서 이 칸에 아무 표시도 없었다. 그런데 그
 * 상품은 품절 탭에 뜬다 — 대시보드의 "품절 3개" 를 눌러 들어온 운영자는 멀쩡해 보이는 세 줄을
 * 보고 그 줄이 왜 거기 있는지 알 수 없다. 쿠폰의 "지정 3개" 와 같은 고장이다.
 *
 * 조회가 급한 것부터 세워 주고(stock-attention-row 검사), 이 칸은 **글자로** 적는다.
 */

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getAdminProducts = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/admin/products')>()),
  getAdminProducts,
}));
vi.mock('@shop/db', () => ({ prisma: {} }));
// 일괄 재고 올리기는 자기 검사가 있다 — 여기서는 목록의 줄만 본다
vi.mock('~/app/admin/products/stock-bulk-actions', () => ({ StockBulkActions: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const Page = (await import('~/app/admin/products/page')).default;

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', slug: 'wool-coat', name: '울 코트',
  brandName: '무어', categoryName: '코트',
  listPrice: won(100_000), salePrice: null,
  status: 'ACTIVE',
  totalStock: 40,
  stockAttention: [],
  waitingRestock: 0,
  createdAt: new Date('2026-08-01'),
  reviewRequestedAt: null, publishRejection: null,
  archivedAt: null, archivedBy: null,
  ...over,
});

const result = (rows: unknown[]) => ({
  rows, total: rows.length, awaitingReview: 0, archivedCount: 0,
  outOfStockCount: 0, lowStockCount: 0,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getAdminProducts.mockResolvedValue(result([row()]));
});

const renderPage = async (params: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

const line = () => within(screen.getByRole('row', { name: /울 코트/ }));

describe('손이 필요한 옵션', () => {
  /** 이것이 고장의 핵심이다 — 합계가 멀쩡한 상품의 품절 옵션 */
  it('합계가 넉넉해도 품절 옵션을 적는다', async () => {
    getAdminProducts.mockResolvedValue(result([row({
      totalStock: 40,
      stockAttention: [{ label: '오트 / S', stock: 0, level: 'OUT', waiting: 0 }],
    })]));

    await renderPage({ stock: 'out' });

    expect(line().getByText(/품절 오트 \/ S/)).toBeInTheDocument();
  });

  it('임박 옵션은 몇 개 남았는지까지 적는다', async () => {
    getAdminProducts.mockResolvedValue(result([row({
      stockAttention: [{ label: '오트 / M', stock: 3, level: 'LOW', waiting: 0 }],
    })]));

    await renderPage({ stock: 'low' });

    const text = line().getByText(/임박 오트 \/ M/).textContent;
    expect(text).toContain('3개');
  });

  /** 0 인 옵션 둘 중 하나는 열두 명이 기다린다 — 무엇을 먼저 채울지는 그것으로 정한다 */
  it('기다리는 사람은 그 옵션 옆에 붙는다', async () => {
    getAdminProducts.mockResolvedValue(result([row({
      stockAttention: [
        { label: '오트 / S', stock: 0, level: 'OUT', waiting: 12 },
        { label: '오트 / L', stock: 0, level: 'OUT', waiting: 0 },
      ],
    })]));

    await renderPage({ stock: 'out' });

    expect(line().getByText(/품절 오트 \/ S/).textContent).toContain('12명 대기');
    expect(line().getByText(/품절 오트 \/ L/).textContent).not.toContain('대기');
  });

  /** 칸이 세로로 늘어지면 목록 자체를 못 읽는다 — 줄에서 상세로 갈 수 있다 */
  it('셋 이상이면 둘만 적고 나머지는 센다', async () => {
    getAdminProducts.mockResolvedValue(result([row({
      stockAttention: [
        { label: '가', stock: 0, level: 'OUT', waiting: 0 },
        { label: '나', stock: 0, level: 'OUT', waiting: 0 },
        { label: '다', stock: 1, level: 'LOW', waiting: 0 },
        { label: '라', stock: 2, level: 'LOW', waiting: 0 },
      ],
    })]));

    await renderPage();

    expect(line().getByText(/외 2개 옵션/)).toBeInTheDocument();
    expect(line().queryByText(/임박 다/)).toBeNull();
  });

  it('멀쩡한 줄에는 아무 말도 하지 않는다 — 늘 붙어 있으면 아무도 안 본다', async () => {
    await renderPage();

    expect(line().queryByText(/품절|임박|대기/)).toBeNull();
    expect(line().getByText('40')).toBeInTheDocument();
  });

  /** 색을 못 보는 사람에게는 색만으로 말한 것이 아무 표시도 없는 것과 같다 */
  it('품절과 임박을 글자로 가른다', async () => {
    getAdminProducts.mockResolvedValue(result([row({
      stockAttention: [
        { label: '오트 / S', stock: 0, level: 'OUT', waiting: 0 },
        { label: '오트 / M', stock: LOW_STOCK_THRESHOLD, level: 'LOW', waiting: 0 },
      ],
    })]));

    await renderPage();

    expect(line().getByText(/^품절 오트 \/ S/)).toBeInTheDocument();
    expect(line().getByText(/^임박 오트 \/ M/)).toBeInTheDocument();
  });

  /**
   * 손댈 옵션은 없는데 기다리는 사람이 남은 경우(채운 뒤 알림이 아직 안 나간 자리) — 그 수가
   * 사라지면 "아무도 안 기다린다" 로 읽힌다.
   */
  it('손댈 옵션이 없어도 기다리는 사람은 말한다', async () => {
    getAdminProducts.mockResolvedValue(result([row({ stockAttention: [], waitingRestock: 5 })]));

    await renderPage();

    expect(line().getByText(/5명 대기/)).toBeInTheDocument();
  });
});
