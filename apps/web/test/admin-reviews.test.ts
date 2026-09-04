import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  review: {
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminReviews } = await import('~/lib/queries/admin-reviews');

const ADMIN: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const MERCHANT: Actor = { id: 'u-merch', role: 'MERCHANT', merchantId: 'm-1' };
const CUSTOMER: Actor = { id: 'u-cust', role: 'CUSTOMER', merchantId: null };

let seq = 0;
const raw = (over: Record<string, unknown> = {}) => ({
  id: `r-${++seq}`, rating: 3, content: '내용', imageUrls: [],
  createdAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, productId: 'p-1',
  user: { name: '홍길동' },
  product: { name: '울 코트' },
  reports: [],
  ...over,
});

const report = (over: Record<string, unknown> = {}) => ({
  id: 'rr-1', reason: 'SPAM', detail: null,
  createdAt: new Date('2026-09-02T00:00:00Z'),
  resolvedAt: null, resolution: null,
  reporter: { name: '김철수' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  db.review.findMany.mockResolvedValue([]);
  db.review.count.mockResolvedValue(0);
});

describe('누가 볼 수 있는가', () => {
  it('가맹점은 들어오지 못한다', async () => {
    /*
     * 자기 상품의 혹평을 내릴 수 있는 사람이 그 상품을 파는 사람이면
     * 리뷰가 상품 설명의 일부가 된다.
     */
    await expect(getAdminReviews(MERCHANT)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.review.findMany).not.toHaveBeenCalled();
  });

  it('고객도 마찬가지다', async () => {
    await expect(getAdminReviews(CUSTOMER)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('관리자는 볼 수 있다', async () => {
    await expect(getAdminReviews(ADMIN)).resolves.toMatchObject({ rows: [] });
  });
});

describe('대기줄', () => {
  it('대기 중인 신고가 있는 글만 담는다', async () => {
    await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(db.review.findMany.mock.calls[0]![0].where).toMatchObject({
      deletedAt: null,
      reports: { some: { resolvedAt: null } },
    });
  });

  it('급한 것이 위로 온다', async () => {
    db.review.findMany.mockResolvedValue([
      raw({ id: 'spam', reports: [report({ reason: 'SPAM' })] }),
      raw({ id: 'privacy', reports: [report({ reason: 'PRIVACY' })] }),
    ]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.rows.map((r) => r.id)).toEqual(['privacy', 'spam']);
  });

  it('점수가 같으면 오래 기다린 것부터', async () => {
    // 새 신고가 계속 앞을 막으면 오래된 건이 영영 처리되지 않는다
    db.review.findMany.mockResolvedValue([
      raw({ id: 'new', createdAt: new Date('2026-09-03'), reports: [report()] }),
      raw({ id: 'old', createdAt: new Date('2026-08-01'), reports: [report()] }),
    ]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.rows.map((r) => r.id)).toEqual(['old', 'new']);
  });

  it('닫힌 신고는 점수에 넣지 않는다', async () => {
    // 이미 본 건이 계속 순서를 끌어올리면 대기줄이 굳는다
    db.review.findMany.mockResolvedValue([
      raw({
        reports: [
          report({ reason: 'PRIVACY', resolvedAt: new Date('2026-09-03'), resolution: 'kept' }),
          report({ id: 'rr-2', reason: 'SPAM' }),
        ],
      }),
    ]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.rows[0]!.openReports).toBe(1);
    expect(page.rows[0]!.state).toBe('reported');
  });

  it('상한을 넘으면 잘랐다고 말한다', async () => {
    // 조용히 자르면 아래쪽 건이 영영 처리되지 않는다
    db.review.findMany.mockResolvedValue(
      Array.from({ length: 201 }, () => raw({ reports: [report()] })),
    );

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.capped).toBe(true);
    expect(page.rows).toHaveLength(200);
  });

  it('대기줄은 페이지를 넘기지 않는다', async () => {
    db.review.findMany.mockResolvedValue([raw({ reports: [report()] })]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.nextCursor).toBeNull();
  });
});

describe('탭', () => {
  it('내려간 글 탭은 내려간 것만 본다', async () => {
    await getAdminReviews(ADMIN, { tab: 'removed' });

    expect(db.review.findMany.mock.calls[0]![0].where).toMatchObject({
      deletedAt: { not: null },
    });
  });

  it('전체 탭은 살아 있는 것만 본다', async () => {
    await getAdminReviews(ADMIN, { tab: 'all' });

    expect(db.review.findMany.mock.calls[0]![0].where).toMatchObject({ deletedAt: null });
  });

  it('전체 탭은 커서로 넘긴다', async () => {
    db.review.findMany.mockResolvedValue(Array.from({ length: 26 }, () => raw()));

    const page = await getAdminReviews(ADMIN, { tab: 'all' });

    expect(page.rows).toHaveLength(25);
    expect(page.nextCursor).toBe('r-25');
  });
});

describe('검색', () => {
  it('상품명과 작성자 이름을 함께 본다', async () => {
    await getAdminReviews(ADMIN, { tab: 'all', q: '코트' });

    const where = db.review.findMany.mock.calls[0]![0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].product.name.contains).toBe('코트');
    expect(where.OR[1].user.name.contains).toBe('코트');
  });

  it('검색해도 탭 조건은 남는다', async () => {
    // OR 가 조건 전체를 덮으면 내려간 글 탭에서 살아 있는 글이 나온다
    await getAdminReviews(ADMIN, { tab: 'removed', q: '코트' });

    expect(db.review.findMany.mock.calls[0]![0].where).toMatchObject({
      deletedAt: { not: null },
    });
  });
});

describe('이름 가리기', () => {
  it('작성자도 신고자도 가린다', async () => {
    // 운영진에게도 이름을 통째로 보여 줄 이유가 없다
    db.review.findMany.mockResolvedValue([raw({ reports: [report()] })]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(page.rows[0]!.authorName).toBe('홍○동');
    expect(page.rows[0]!.reports[0]!.reporterName).toBe('김○수');
  });
});
