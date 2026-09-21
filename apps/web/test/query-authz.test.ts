import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const db = vi.hoisted(() => {
  const empty = () => vi.fn<(...a: any[]) => any>().mockResolvedValue([]);
  return {
    order: { findMany: empty(), findFirst: empty(), count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0), aggregate: empty(), groupBy: empty() },
    product: { findMany: empty(), findFirst: empty(), count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0) },
    settlement: { findMany: empty() },
    merchant: { findMany: empty() },
    eventLog: { findMany: empty(), count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0) },
    $queryRaw: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
  };
});
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { join: () => '' } }));

const { getDashboard } = await import('~/lib/queries/admin/dashboard');
const { getAdminOrders, getAdminOrder } = await import('~/lib/queries/admin/orders');
const { getAdminProducts, getAdminProductDetail } = await import('~/lib/queries/admin/products');
const { getSettlements } = await import('~/lib/queries/admin/settlements');
const { getMerchants } = await import('~/lib/queries/admin/merchants');

const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const merchantNoScope: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: null };

beforeEach(() => vi.clearAllMocks());

/**
 * 범위 제한과 **권한 확인은 다른 일**이다.
 *
 * where 절은 "남의 것을 빼고 읽는다" 이지 "이 사람이 봐도 되는가" 가 아니다.
 * 지금은 화면 가드가 앞에서 막고 있지만, 그 가드가 실제로 뚫린 적이 있다 —
 * requireAdmin 이 넘겨받은 권한만 보고 admin:access 를 빠뜨렸다. 조회가
 * 스스로 확인하면 가드가 새도 여기서 멈춘다.
 */
describe('고객은 어떤 어드민 조회도 통과하지 못한다', () => {
  const cases = [
    ['getDashboard', () => getDashboard(customer, '7d')],
    ['getAdminOrders', () => getAdminOrders(customer)],
    ['getAdminOrder', () => getAdminOrder(customer, '20260101-1')],
    ['getAdminProducts', () => getAdminProducts(customer)],
    ['getAdminProductDetail', () => getAdminProductDetail(customer, 'p-1')],
    ['getSettlements', () => getSettlements(customer)],
    ['getMerchants', () => getMerchants(customer)],
  ] as const;

  it.each(cases)('%s', async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('막힌 조회는 DB 를 치지 않는다', async () => {
    // 권한을 보기 전에 읽으면, 막아도 이미 읽은 뒤다
    await expect(getAdminOrders(customer)).rejects.toThrow();
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('소속 없는 가맹점 계정', () => {
  it('아무 범위도 없으므로 막힌다', async () => {
    // role 만 MERCHANT 이고 merchantId 가 비면 hasPermission 이 false 다
    await expect(getSettlements(merchantNoScope)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('권한 확인을 빠뜨린 조회가 없다', () => {
  it('Actor 를 받는 어드민 조회는 전부 권한을 확인한다', () => {
    /*
     * 새 조회를 만들 때 조용히 빠뜨리는 실수다 — 화면 가드가 앞에 있으니
     * 아무 일도 일어나지 않고, 그 가드가 없는 자리에서 부르는 순간 샌다.
     */
    /*
     * 한 파일이 아니라 **어드민 조회 폴더 전체**를 훑는다. 파일 이름을 적어
     * 두면 새로 만든 모듈이 목록 밖에 있어 조용히 빠진다 — 이 검사가 막으려는
     * 실수와 정확히 같은 모양의 실수다.
     */
    /*
     * **어드민 폴더만 훑고 있었다.** 운영 조회가 전부 거기 있는 줄 알았는데, 감사 로그·문의 대기줄·리뷰 관리·
     * 고객센터 글은 `queries/` 바로 아래에 손님 조회와 섞여 있다(손님 쪽과 같은 표를 읽기 때문이다). 그래서
     * 그 여섯은 이 검사를 한 번도 받지 않았다 — 지금은 다들 권한을 확인하지만, 그건 규칙이 아니라 습관이다.
     *
     * 손님 조회도 Actor 를 받는다 — "내 것" 을 알아내려고, 또는 보는 사람에 따라 가릴 것을 가리려고. 그쪽은
     * 권한 문이 아니라 범위·가림이 문제라 아래에서 까닭과 함께 빼고, 무엇을 읽는지는 customer-query-scope 가 본다.
     */
    const dirs = [join(process.cwd(), 'src/lib/queries/admin'), join(process.cwd(), 'src/lib/queries')];
    const src = dirs
      .flatMap((dir) =>
        readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name.endsWith('.ts'))
          .map((e) => readFileSync(join(dir, e.name), 'utf8')),
      )
      .join('\n');

    /**
     * 권한 문이 아닌 조회 — 막을 것이 아니라 **보는 사람에 따라 달라질** 것들이다.
     * 여기에 넣으면 "누가 볼 수 있나" 는 다른 검사가 본다(까닭에 적는다).
     */
    const VIEWER_SCOPED: Readonly<Record<string, string>> = {
      getMyPageSummary: '마이페이지 요약 — actor 는 "내가 누구인가" 일 뿐, 남의 것을 읽을 길이 없다(customer-query-scope)',
      getReviewableItems: '내 주문 줄에서 아직 안 쓴 후기를 고른다 — 같은 결',
      getProductInquiries: '상품 화면의 공개 문의 목록이다. viewer 는 막는 열쇠가 아니라 비밀글을 가릴지 정하는 값이고, 그 가림은 core(canAnswerInquiry)와 문의 검사가 본다',
    };
    /*
     * **훑기가 헛돌면 이 검사가 통과한다.** 폴더를 빈 곳으로 바꿔 돌려 보니
     * `missing` 이 비어 그대로 통과했다. 훑은 것이 있는지 먼저 못 박는다.
     */
    const found: string[] = [];
    const missing: string[] = [];

    for (const m of src.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\)[^{]*\{/g)) {
      const [, name, args] = m;
      if (!args?.includes('Actor')) continue;
      found.push(name!);
      const at = (m.index ?? 0) + m[0].length;
      const body = src.slice(at, at + 800);
      // 공용 가드(assertAdminQuery)든 직접 확인이든, 무엇이든 보아야 한다
      if (name! in VIEWER_SCOPED) continue;
      // 공용 가드(assertAdminQuery)든 직접 확인이든, 무엇이든 보아야 한다.
      // hasPermission 은 던지지 않고 범위를 좁히는 쪽이라 그것도 "보았다" 로 센다
      const guarded = body.includes('assertAdminQuery') || body.includes('assertPermission')
        || body.includes('hasPermission');
      if (!guarded) missing.push(name!);
    }

    expect(found.length, 'Actor 를 받는 어드민 조회를 하나도 못 찾았다').toBeGreaterThan(5);
    expect(missing).toEqual([]);

    // 빼 둔 이름이 실제로 있는 조회인지 — 목록만 남고 함수가 사라지면 안 된다
    expect(Object.keys(VIEWER_SCOPED).filter((n) => !src.includes(`function ${n}(`))).toEqual([]);
  });
});
