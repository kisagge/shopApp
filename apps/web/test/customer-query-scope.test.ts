import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **손님의 것은 주인만 연다.**
 *
 * 어드민 조회는 권한 검사를 빠뜨리지 않았는지 따로 지킨다(query-authz). 그런데 **손님 조회에는 그런 자리가
 * 없었다** — 소유자를 거르는 코드는 멀쩡히 있었지만 그것을 부르는 검사가 단위에도 e2e 에도 하나도 없어서,
 * `where` 에서 `userId` 한 줄이 빠져도 아무 일도 일어나지 않는다.
 *
 * 주문번호는 `20260903-0000001` 처럼 날짜와 연번이라 **추측할 수 있다.** 조건이 빠지면 번호를 아는 것만으로
 * 남의 배송지·전화번호·영수증·가상계좌번호가 열린다.
 */

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  review: { findFirst: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  inquiry: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  notification: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  address: { findFirst: vi.fn<(...a: any[]) => any>() },
  productVariant: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getOrderForUser, getDefaultAddress } = await import('~/lib/queries/orders');
const { getMyReview, getMyReviews } = await import('~/lib/queries/reviews');
const { getMyOrders, getPointHistory } = await import('~/lib/queries/mypage');
const { getMyInquiries } = await import('~/lib/queries/inquiries');
const { getMyNotifications, countUnread } = await import('~/lib/queries/notifications');

const OTHER = 'u-owner';
const ME = 'u-me';

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(db)) {
    for (const [name, fn] of Object.entries(model)) {
      (fn as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
        name === 'count' ? 0 : name.startsWith('findMany') ? [] : null,
      );
    }
  }
  db.order.findMany.mockResolvedValue([]);
  db.review.findMany.mockResolvedValue([]);
  db.inquiry.findMany.mockResolvedValue([]);
  db.notification.findMany.mockResolvedValue([]);
  db.pointTransaction.findMany.mockResolvedValue([]);
});

/** 조회가 DB 에 건넨 where 절 */
const whereOf = (fn: { mock: { calls: unknown[][] } }): Record<string, unknown> =>
  (fn.mock.calls[0]?.[0] as { where: Record<string, unknown> }).where;

describe('주문은 주인만 연다', () => {
  it('주문번호로 열 때도 그 사람 것인지 함께 묻는다', async () => {
    await getOrderForUser('20260903-0000001', ME);

    expect(whereOf(db.order.findFirst), '주문번호만으로 열면 번호를 아는 사람이 남의 주문을 본다')
      .toEqual({ orderNo: '20260903-0000001', userId: ME });
  });

  it('남의 주문번호를 넣어도 그 사람 몫으로 찾지 않는다', async () => {
    // DB 가 없는 것으로 답하면(주인이 아니므로) 화면은 404 로 간다
    db.order.findFirst.mockResolvedValue(null);

    expect(await getOrderForUser('20260903-0000001', OTHER)).toBeNull();
    expect(whereOf(db.order.findFirst)['userId']).toBe(OTHER);
  });

  it('기본 배송지도 그 사람 것만 찾는다', async () => {
    await getDefaultAddress(ME);
    expect(whereOf(db.address.findFirst)).toEqual({ userId: ME });
  });
});

describe('마이페이지의 목록도 주인 것만 센다', () => {
  it('내 주문', async () => {
    await getMyOrders(ME, {}, { page: 1, take: 10 });
    expect(whereOf(db.order.findMany)['userId']).toBe(ME);
    expect(whereOf(db.order.count)['userId']).toBe(ME);
  });

  it('내 적립금 내역', async () => {
    await getPointHistory(ME, 1);
    expect(whereOf(db.pointTransaction.findMany)['userId']).toBe(ME);
    expect(whereOf(db.pointTransaction.count)['userId']).toBe(ME);
  });

  it('내 후기', async () => {
    await getMyReviews(ME, 1);
    expect(whereOf(db.review.findMany)['userId']).toBe(ME);
  });

  it('내 문의', async () => {
    await getMyInquiries(ME, 1);
    expect(whereOf(db.inquiry.findMany)['authorId']).toBe(ME);
  });

  it('내 알림', async () => {
    await getMyNotifications(ME, 'customer', 1);
    expect(whereOf(db.notification.findMany)['userId']).toBe(ME);
  });

  it('머리의 안 읽은 수', async () => {
    await countUnread(ME, 'customer');
    expect(whereOf(db.notification.count)['userId']).toBe(ME);
  });

  it('내 후기 한 건 — 글 id 를 알아도 남의 것은 안 열린다', async () => {
    await getMyReview(ME, 'rv-1');
    expect(whereOf(db.review.findFirst)).toMatchObject({ id: 'rv-1', userId: ME });
  });
});

/**
 * **새로 만드는 조회도 이 검사를 받아야 한다.**
 *
 * 위 검사들은 이름을 적어 둔 목록이라, 새 조회가 생기면 조용히 빠진다 — 이 검사가 막으려는 실수와 같은 모양이다.
 * 그래서 폴더를 훑어, 소유자를 인자로 받는 조회가 전부 위에 등장하는지 본다.
 */
describe('빠진 조회가 없다', () => {
  const DIR = join(process.cwd(), 'src', 'lib', 'queries');
  const here = readFileSync(join(process.cwd(), 'test', 'customer-query-scope.test.ts'), 'utf8');

  /** 운영 화면 조회는 query-authz 가 따로 본다 */
  const files = readdirSync(DIR).filter((f) => f.endsWith('.ts'));

  /**
   * 소유자 id 를 받는 조회인데 여기서 안 보는 것들. 빼는 까닭을 함께 적는다 — 이유 없이 빠지면 그게 구멍이다.
   */
  const EXEMPT: Readonly<Record<string, string>> = {
    // 운영 조회 — 여기서 보는 것은 "내 것만 읽는가" 이고, 저쪽은 "볼 권한이 있는가" 다(query-authz)
    getAdminReviews: '운영 조회 — 권한 검사는 query-authz 가 본다',
    getAdminInquiries: '운영 조회 — 권한 검사는 query-authz 가 본다',
    getAdminSupportPosts: '운영 조회 — 권한 검사는 query-authz 가 본다',
    getAuditLogs: '운영 조회 — 권한 검사는 query-authz 가 본다',
    exportAuditLogs: '운영 조회 — 권한 검사는 query-authz 가 본다',
    countPendingInquiries: '운영 조회 — 권한 검사는 query-authz 가 본다',
    getPointExpiry: '소멸 예정 묶음을 세는 집계다. 같은 파일의 getPointHistory 가 같은 where 를 쓴다',
    getMyPageSummary: 'actor 를 받아 위 조회들을 불러 모으는 자리다 — 각각은 여기서 본다',
    getReviewableItems: '주문 줄에서 아직 안 쓴 후기를 고른다. actor 범위는 getMyOrders 와 같은 where 를 쓴다',
    quoteCart: '장바구니는 화면이 준 줄로 견적만 낸다 — 저장된 것을 읽지 않는다',
    quoteCartDetailed: '같다',
  };

  it('소유자를 받는 조회가 전부 검사에 등장한다', () => {
    const missing: string[] = [];
    let found = 0;

    for (const file of files) {
      const source = readFileSync(join(DIR, file), 'utf8');
      for (const [, name, args] of source.matchAll(/export async function (\w+)\(([^)]*)\)/g)) {
        if (!/userId: string|actor: Actor/.test(args ?? '')) continue;
        found += 1;
        if (name! in EXEMPT) continue;
        if (!here.includes(`${name}(`)) missing.push(`${file} — ${name}`);
      }
    }

    // 훑기가 헛돌면 아래가 빈 채로 통과한다
    expect(found, '소유자를 받는 조회를 하나도 못 찾았다').toBeGreaterThan(5);
    expect(missing, '이 조회들은 남의 것을 여는지 아무도 안 본다').toEqual([]);
  });

  it('빼 둔 조회는 실제로 있는 조회다 — 목록만 남고 함수가 사라지면 안 된다', () => {
    const all = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
    expect(Object.keys(EXEMPT).filter((name) => !all.includes(`function ${name}(`))).toEqual([]);
  });
});
