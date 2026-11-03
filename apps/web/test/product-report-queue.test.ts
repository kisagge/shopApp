import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  productReport: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getProductReportQueue } = await import('~/lib/queries/admin/product-reports');

/**
 * 상품 신고 대기줄.
 *
 * **점수는 SQL 로 못 매긴다**(사유별 최댓값 + 건수). 가져와 메모리에서 세우므로 **DB 에서
 * 자르는 방향이 무엇이 보이느냐를 정한다** — 리뷰 신고 대기줄이 최신순으로 잘라 오래
 * 기다린 신고를 통째로 버린 적이 있다. 그 방향은 `waiting-first` 가 함께 못 박는다.
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

let seq = 0;
const report = (over: Record<string, unknown> = {}) => ({
  id: `pr-${++seq}`,
  reason: 'WRONG_INFO',
  detail: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  resolvedAt: null,
  resolution: null,
  reporter: { name: '홍길동' },
  product: { id: 'p-1', name: '울 코트', slug: 'wool-coat', deletedAt: null },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  db.productReport.findMany.mockResolvedValue([]);
});

describe('누가 볼 수 있는가', () => {
  /**
   * **가맹점은 못 본다.** 신고의 대상이 파는 쪽인데 그 쪽이 자기 건을 닫을 수 있으면
   * 신고가 운영진에게 닿지 않는다. 리뷰는 읽기를 열어 뒀지만(자기 물건이 어떤 소리를
   * 듣는지 알아야 고친다) 여기서는 읽는 것이 곧 처리하는 자리다.
   */
  it.each([
    ['가맹점', merchant],
    ['고객', customer],
  ])('%s 는 막힌다', async (_label, actor) => {
    await expect(getProductReportQueue(actor)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.productReport.findMany).not.toHaveBeenCalled();
  });

  it('운영진은 본다', async () => {
    await expect(getProductReportQueue(admin)).resolves.toBeTruthy();
  });
});

describe('상품으로 모은다', () => {
  it('같은 상품의 신고는 한 줄이 된다', async () => {
    db.productReport.findMany.mockResolvedValue([
      report({ reason: 'COUNTERFEIT' }),
      report({ reason: 'UNSAFE' }),
    ]);

    const { rows } = await getProductReportQueue(admin);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.reports).toHaveLength(2);
    expect(rows[0]!.openReports).toBe(2);
  });

  it('신고자 이름은 가린다 — 운영진에게도 통째로 보여 줄 이유가 없다', async () => {
    db.productReport.findMany.mockResolvedValue([report({ reporter: { name: '홍길동' } })]);

    const { rows } = await getProductReportQueue(admin);

    expect(rows[0]!.reports[0]!.reporterName).toBe('홍○○');
  });

  it('보관된 상품은 그렇게 말한다 — 이미 끝난 건이다', async () => {
    db.productReport.findMany.mockResolvedValue([
      report({ product: { id: 'p-1', name: '울 코트', slug: 'wool-coat', deletedAt: new Date() } }),
    ]);

    const { rows } = await getProductReportQueue(admin);

    expect(rows[0]!.archived).toBe(true);
    expect(rows[0]!.state).toBe('archived');
  });
});

describe('순서', () => {
  const at = (iso: string) => new Date(iso);

  it('점수가 높은 상품이 먼저다', async () => {
    db.productReport.findMany.mockResolvedValue([
      report({ reason: 'WRONG_INFO', product: { id: 'p-light', name: '가벼움', slug: 'a', deletedAt: null } }),
      report({ reason: 'PROHIBITED', product: { id: 'p-heavy', name: '무거움', slug: 'b', deletedAt: null } }),
    ]);

    const { rows } = await getProductReportQueue(admin);

    expect(rows.map((r) => r.productId)).toEqual(['p-heavy', 'p-light']);
  });

  /**
   * **같은 점수면 오래 기다린 쪽이 먼저다.** 적지 않으면 들어온 순서가 순서를 정하고,
   * 그것은 우연이다.
   */
  it('점수가 같으면 오래 기다린 쪽이 먼저다', async () => {
    db.productReport.findMany.mockResolvedValue([
      report({
        createdAt: at('2026-11-02T00:00:00Z'),
        product: { id: 'p-new', name: '새것', slug: 'a', deletedAt: null },
      }),
      report({
        createdAt: at('2026-10-01T00:00:00Z'),
        product: { id: 'p-old', name: '오래된것', slug: 'b', deletedAt: null },
      }),
    ]);

    const { rows } = await getProductReportQueue(admin);

    expect(rows.map((r) => r.productId)).toEqual(['p-old', 'p-new']);
  });
});

describe('상한', () => {
  /**
   * 상한을 넘으면 그 사실을 화면이 적어야 한다 — 안 적으면 운영자는 그것이 전부라고 읽고,
   * 창 밖의 신고는 아무도 다시 보지 않는다.
   */
  it('넘치면 넘쳤다고 말하고 상한까지만 센다', async () => {
    db.productReport.findMany.mockResolvedValue(
      Array.from({ length: 201 }, (_, i) =>
        report({ product: { id: `p-${i}`, name: `상품${i}`, slug: `s-${i}`, deletedAt: null } }),
      ),
    );

    const { rows, truncated } = await getProductReportQueue(admin);

    expect(truncated).toBe(true);
    expect(rows).toHaveLength(200);
  });

  it('상한 안이면 넘쳤다고 하지 않는다', async () => {
    db.productReport.findMany.mockResolvedValue([report()]);

    expect((await getProductReportQueue(admin)).truncated).toBe(false);
  });

  /** 한 줄 더 읽어야 "넘쳤는지" 를 알 수 있다 */
  it('상한보다 하나 더 읽는다', async () => {
    await getProductReportQueue(admin);

    expect(db.productReport.findMany.mock.calls[0]![0].take).toBe(201);
  });
});

describe('어느 것을 읽는가', () => {
  it('대기줄은 처리 안 된 것만', async () => {
    await getProductReportQueue(admin, { tab: 'open' });

    expect(db.productReport.findMany.mock.calls[0]![0].where).toEqual({ resolvedAt: null });
  });

  it('처리한 것 탭은 처리된 것만', async () => {
    await getProductReportQueue(admin, { tab: 'done' });

    expect(db.productReport.findMany.mock.calls[0]![0].where).toEqual({
      resolvedAt: { not: null },
    });
  });
});
