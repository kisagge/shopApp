import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  review: {
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
  },
  // 답글을 단 사람과 신고를 판단한 사람을 한 번에 읽는다(loadActors)
  user: { findMany: vi.fn<(...a: any[]) => any>(() => Promise.resolve([])) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminReviews } = await import('~/lib/queries/admin-reviews');

const ADMIN: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const MERCHANT: Actor = { id: 'u-merch', role: 'MERCHANT', merchantId: 'm-1' };
const CUSTOMER: Actor = { id: 'u-cust', role: 'CUSTOMER', merchantId: null };

let seq = 0;
const raw = (over: Record<string, unknown> = {}) => ({
  id: `r-${++seq}`, rating: 3, content: '내용', _count: { images: 0 },
  createdAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, productId: 'p-1',
  user: { name: '홍길동' },
  product: { name: '울 코트', brand: { merchantId: null } },
  reply: null, repliedAt: null, replyEditedAt: null,
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
  it('가맹점은 들어오되 자기 상품만 본다', async () => {
    /*
     * **한동안 아예 못 들어왔다.** 그때 적어 둔 이유("자기 상품의 혹평을
     * 내릴 수 있으면 리뷰가 상품 설명의 일부가 된다")는 지금도 맞지만, 그건
     * **내리는 것**에 걸리는 말이지 읽는 것에 걸리는 말이 아니었다. 읽기는
     * `review:read`, 내리기는 `review:moderate` 로 갈랐다.
     *
     * **여기서 보는 것은 범위다.** 권한을 낮추기만 하고 조회를 안 좁히면
     * 가맹점이 경쟁 브랜드의 혹평까지 본다. 그건 화면이 아니라 쿼리의 일이다.
     */
    await expect(getAdminReviews(MERCHANT)).resolves.toMatchObject({ rows: [] });

    const where = db.review.findMany.mock.calls[0]?.[0]?.where as
      | { product?: { brand?: { merchantId?: string } } }
      | undefined;
    expect(
      where?.product?.brand?.merchantId,
      '가맹점 조회에 자기 가맹점 조건이 안 붙었다',
    ).toBe(MERCHANT.merchantId);
  });

  it('처리 대기 수도 자기 것만 센다 — 남의 신고 건수가 새면 안 된다', async () => {
    await getAdminReviews(MERCHANT);

    const where = db.review.count.mock.calls[0]?.[0]?.where as
      | { product?: { brand?: { merchantId?: string } } }
      | undefined;
    expect(where?.product?.brand?.merchantId).toBe(MERCHANT.merchantId);
  });

  it('운영진 조회에는 가맹점 조건이 안 붙는다', async () => {
    // 좁히는 조건이 늘 붙으면 관리자가 아무것도 못 본다
    await getAdminReviews(ADMIN);

    const where = db.review.findMany.mock.calls[0]?.[0]?.where as
      | { product?: unknown }
      | undefined;
    expect(where?.product, '관리자 조회까지 가맹점으로 좁혀졌다').toBeUndefined();
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

  /**
   * **상한에 걸릴 때 남길 것은 오래 기다린 쪽이다.**
   *
   * 점수는 SQL 로 못 매기므로 가져와서 메모리에서 세운다 — 그러면 **DB 에서 자르는 방향**이 무엇이
   * 보이느냐를 정한다. 최신순으로 자르고 있어서, 상한을 넘기는 날에는 가장 오래 기다린 신고가 통째로
   * 잘려 나갔다. 바로 아래 정렬이 "새 신고가 계속 앞을 막으면 안 된다" 고 적어 두고 그 위에서 반대로
   * 자르던 셈이다(검수 대기·반품 대기열·주문 목록과도 어긋난다).
   */
  it('상한에 걸리면 오래 기다린 쪽을 남긴다', async () => {
    await getAdminReviews(ADMIN, { tab: 'reported' });

    expect(db.review.findMany.mock.calls[0]![0].orderBy).toEqual({ createdAt: 'asc' });
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

  it('대기줄은 쪽을 넘기지 않는다 — 상한까지 한 번에 보여 주는 일감이다', async () => {
    db.review.findMany.mockResolvedValue([raw({ reports: [report()] })]);

    const page = await getAdminReviews(ADMIN, { tab: 'reported', page: 3 });

    // 쪽 번호를 줘도 건너뛰지 않는다
    expect(db.review.findMany.mock.calls.at(-1)?.[0].skip).toBeUndefined();
    expect(page.total).toBe(page.rows.length);
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

  it('전체 탭은 쪽 번호로 넘긴다', async () => {
    db.review.findMany.mockResolvedValue(Array.from({ length: 25 }, () => raw()));

    const page = await getAdminReviews(ADMIN, { tab: 'all', page: 2 });

    expect(page.rows).toHaveLength(25);
    // 둘째 쪽은 한 묶음을 건너뛴다
    const args = db.review.findMany.mock.calls.at(-1)?.[0];
    expect(args.skip).toBe(25);
    expect(args.take).toBe(25);
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

/**
 * **신고를 누가 판단했는지.** 언제·무엇으로(내림·문제없음)는 화면에 있었는데 누가 했는지는 적어 두기만 했다 —
 * 담당자가 여럿이면 "이 혹평을 누가 내렸나" 에 감사 로그로만 답할 수 있었다. 바로 옆 답글은 진작 고친 자리다.
 */
describe('신고를 판단한 사람', () => {
  const reported = (over: Record<string, unknown> = {}) => ({
    id: 'rv-1', rating: 2, content: '별로', _count: { images: 0 },
    createdAt: new Date('2026-09-01'), deletedAt: null, productId: 'p-1',
    user: { name: '김손님' },
    product: { name: '울 코트', brand: { merchantId: 'm-a' } },
    reply: null, repliedAt: null, replyEditedAt: null, repliedById: null,
    reports: [{
      id: 'rp-1', reason: 'ABUSE', detail: null, createdAt: new Date('2026-09-02'),
      resolvedAt: new Date('2026-09-03'), resolution: 'removed', resolvedById: 'u-park',
      reporter: { name: '박신고' },
    }],
    ...over,
  });

  beforeEach(() => {
    db.review.findMany.mockResolvedValue([reported()]);
    db.review.count.mockResolvedValue(1);
    db.user.findMany.mockResolvedValue([{ id: 'u-park', name: '박운영', role: 'ADMIN', merchantId: null }]);
  });

  it('운영진에게는 이름과 역할로 보인다', async () => {
    const list = await getAdminReviews(ADMIN, { tab: 'all' });

    expect(list.rows[0]?.reports[0]?.resolvedBy).toBe('박운영 · 관리자');
  });

  it('가맹점에게 운영진의 이름은 새지 않는다', async () => {
    const list = await getAdminReviews({ id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' }, { tab: 'all' });

    expect(list.rows[0]?.reports[0]?.resolvedBy).toBe('운영진');
  });

  it('아직 안 본 신고에는 사람이 없다 — 빈 이름이 아니라 아무것도 아니다', async () => {
    db.review.findMany.mockResolvedValue([reported({
      reports: [{
        id: 'rp-1', reason: 'ABUSE', detail: null, createdAt: new Date('2026-09-02'),
        resolvedAt: null, resolution: null, resolvedById: null,
        reporter: { name: '박신고' },
      }],
    })]);

    const list = await getAdminReviews(ADMIN, { tab: 'all' });

    expect(list.rows[0]?.reports[0]?.resolvedBy).toBeNull();
  });

  it('사람을 한 번에 묻는다 — 줄마다 물으면 쪽 하나에 스무 번이 나간다', async () => {
    await getAdminReviews(ADMIN, { tab: 'all' });

    expect(db.user.findMany).toHaveBeenCalledOnce();
  });
});
