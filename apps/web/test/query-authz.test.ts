import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, permissionsOf, type Actor, type Permission } from '@shop/core';
import { actorQueries, queriesSource } from './admin-queries';

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
const { assertAdminQuery } = await import('~/lib/queries/admin/scope');

const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const merchantNoScope: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: null };

/**
 * 권한 문이 아닌 조회 — 막을 것이 아니라 **보는 사람에 따라 달라질** 것들이다.
 * 여기에 넣으면 "누가 볼 수 있나" 는 다른 검사가 본다(까닭에 적는다).
 */
const VIEWER_SCOPED: Readonly<Record<string, string>> = {
  getMyPageSummary: '마이페이지 요약 — actor 는 "내가 누구인가" 일 뿐, 남의 것을 읽을 길이 없다(customer-query-scope)',
  getReviewableItems: '내 주문 줄에서 아직 안 쓴 후기를 고른다 — 같은 결',
  getProductInquiries: '상품 화면의 공개 문의 목록이다. viewer 는 막는 열쇠가 아니라 비밀글을 가릴지 정하는 값이고, 그 가림은 core(canAnswerInquiry)와 문의 검사가 본다',
};

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
     * 폴더에서 모으는 일은 `./admin-queries` 가 한다 — 아래의 "어느 권한을 묻는지" 검사도 같은 훑기를 쓴다.
     * 두 벌로 두면 한쪽만 고치게 된다.
     *
     * **어드민 폴더만 훑고 있었다.** 운영 조회가 전부 거기 있는 줄 알았는데, 감사 로그·문의 대기줄·리뷰 관리·
     * 고객센터 글은 `queries/` 바로 아래에 손님 조회와 섞여 있다(손님 쪽과 같은 표를 읽기 때문이다). 그래서
     * 그 여섯은 이 검사를 한 번도 받지 않았다 — 지금은 다들 권한을 확인하지만, 그건 규칙이 아니라 습관이다.
     *
     * 손님 조회도 Actor 를 받는다 — "내 것" 을 알아내려고, 또는 보는 사람에 따라 가릴 것을 가리려고. 그쪽은
     * 권한 문이 아니라 범위·가림이 문제라 아래에서 까닭과 함께 빼고, 무엇을 읽는지는 customer-query-scope 가 본다.
     */
    const src = queriesSource();

    /*
     * **훑기가 헛돌면 이 검사가 통과한다.** 폴더를 빈 곳으로 바꿔 돌려 보니
     * `missing` 이 비어 그대로 통과했다. 훑은 것이 있는지 먼저 못 박는다.
     */
    const found: string[] = [];
    const missing: string[] = [];

    for (const { name, body } of actorQueries(src)) {
      found.push(name);
      if (name in VIEWER_SCOPED) continue;
      /*
       * **공용 가드 하나로 본다.**
       *
       * 예전에는 `assertPermission` 만 부르는 것도 통과시켰다. 값은 같았다 — 저 권한들을
       * 고객이 하나도 갖고 있지 않아서다. 하지만 **고객이 가진 권한**(order:read ·
       * product:read)으로 조회를 하나 만드는 날, 그 하나는 콘솔 진입을 안 보고 통과한다.
       * requireAdmin 이 정확히 그 실수로 결함이었다.
       *
       * hasPermission 은 던지지 않고 범위를 좁히는 쪽이라 그것도 "보았다" 로 센다.
       */
      const guarded = body.includes('assertAdminQuery') || body.includes('hasPermission');
      if (!guarded) missing.push(name);
    }

    expect(found.length, 'Actor 를 받는 어드민 조회를 하나도 못 찾았다').toBeGreaterThan(5);
    expect(
      missing,
      `콘솔 진입을 함께 보지 않는 조회가 있다:\n${missing.join('\n')}\n` +
        'queries/admin/scope 의 assertAdminQuery(actor, 권한) 을 쓰면 된다.',
    ).toEqual([]);

    // 빼 둔 이름이 실제로 있는 조회인지 — 목록만 남고 함수가 사라지면 안 된다
    expect(Object.keys(VIEWER_SCOPED).filter((n) => !src.includes(`function ${n}(`))).toEqual([]);
  });
});

/**
 * 공용 가드가 실제로 콘솔 진입을 함께 보는가.
 *
 * **고객도 order:read 와 product:read 를 갖고 있다.** 개별 권한만 확인하는 조회는 그
 * 손님을 그대로 통과시킨다 — requireAdmin 이 정확히 그 실수로 결함이었다. 한 관례로
 * 모은 김에, 그 관례가 지키는 것이 무엇인지 여기서 못 박는다.
 */
describe('공용 가드', () => {
  it('고객이 가진 권한이어도 콘솔 조회는 막는다', () => {
    // 고객은 order:read 를 갖고 있다. 그래도 콘솔의 조회는 열리면 안 된다.
    expect(() => assertAdminQuery(customer, 'order:read')).toThrow(ForbiddenError);
  });

  it('가맹점은 통과한다 — 콘솔은 그들도 쓴다', () => {
    const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
    expect(() => assertAdminQuery(merchant, 'order:read')).not.toThrow();
  });

  it('소속 없는 가맹점은 막는다 — 아무 범위도 없다', () => {
    expect(() => assertAdminQuery(merchantNoScope, 'order:read')).toThrow(ForbiddenError);
  });

  it('콘솔에 들어와도 그 권한이 없으면 막는다', () => {
    const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
    // 가맹점은 환불하지 못한다 — 돈이 나가는 동작이다
    expect(() => assertAdminQuery(merchant, 'order:refund')).toThrow(ForbiddenError);
  });
});

/**
 * 관문이 **있는지**는 위에서 보았다. 여기서는 **무엇을 묻는지** 본다.
 *
 * 위의 훑기는 `assertAdminQuery` 가 불렸는지만 센다 — 권한 이름은 안 본다. 그래서 오류함의 `analytics:all` 을
 * `order:read` 로 바꿔도 전부 초록이고, 그 순간 가맹점에게 **다른 가맹점 화면에서 난 오류와, 우리 코드 구조가
 * 그대로 드러나는 스택**이 열린다. 적립금 원장도 같다 — `user:read` 를 `order:read` 로 바꾸면 남의 회원 이름과
 * 이메일과 적립금 내역이 가맹점 콘솔에 뜬다. 둘 다 권한 한 글자만 바꾸면 되는 일이다.
 *
 * **표가 명세다.** 손으로 적는 것이 이 검사의 뜻이라 소스를 바꾸면 표도 함께 바꿔야 하고, 그때 "이 사람이 봐도
 * 되는가" 를 한 번 더 묻게 된다. 대신 표에 없는 새 조회는 진다 — 손 목록만 늦게 자라는 실수를 막는다.
 */
describe('조회가 묻는 권한', () => {
  const DEMANDS: Readonly<Record<string, Permission>> = {
    // 콘솔 진입만 본다 — 숫자는 보는 사람의 범위로 좁혀 나온다
    getDashboard: 'admin:access',
    // 플랫폼 전체의 오류함. 스택과 다른 가맹점의 오류가 드러난다
    getErrorGroups: 'analytics:all',
    setErrorResolved: 'analytics:all',
    // 전체 방문·전환. 다른 가맹점의 성과를 역산할 수 있다
    getTrafficHistory: 'analytics:all',
    getWebVitals: 'analytics:all',
    getRouteVitals: 'analytics:all',
    // 배송비는 가게 전체의 약속이다
    getShippingPolicyEdit: 'shipping:write',
    // 고객센터의 글과 방침·회수 주소는 플랫폼이 쓴다
    getReturnAddressEdit: 'support:write',
    getPolicyEdits: 'support:write',
    getAdminSupportPosts: 'support:write',
    getAdminSupportPost: 'support:write',
    getMerchants: 'merchant:read',
    getMerchantDetail: 'merchant:read',
    // 회원의 개인정보가 걸린 자리 — 가맹점에게 없다
    getAdminUsers: 'user:read',
    getAdminUserDetail: 'user:read',
    getAdminPointAccount: 'user:read',
    getAuditLogs: 'user:read',
    exportAuditLogs: 'user:read',
    // 입점 승인은 권한 부여와 같은 문을 쓴다 — 관리자에게도 없다
    getApprovedMerchants: 'user:assignRole',
    getAdminOrders: 'order:read',
    getAdminOrder: 'order:read',
    exportAdminOrders: 'order:read',
    // 반품 대기줄은 주문을 읽는 일이다. 승인·반려(return:resolve)는 그다음이다
    getReturnQueue: 'order:read',
    getAdminProducts: 'product:read',
    getAdminProductDetail: 'product:read',
    getSettlements: 'settlement:read',
    getAdminReviews: 'review:read',
    getAdminInquiries: 'inquiry:answer',
    countPendingInquiries: 'inquiry:answer',
  };

  /** 본문에서 관문이 묻는 권한. 첫 관문만 본다 — 조회 하나가 문을 둘 열지 않는다 */
  const demandOf = (body: string): string | undefined =>
    /assertAdminQuery\(\s*\w+\s*,\s*'([^']+)'/.exec(body)?.[1];

  const guarded = actorQueries().filter((q) => !(q.name in VIEWER_SCOPED));

  it('소스가 묻는 권한이 표와 같다', () => {
    expect(guarded.length, 'Actor 를 받는 운영 조회를 못 찾았다').toBeGreaterThan(20);

    const actual = Object.fromEntries(guarded.map((q) => [q.name, demandOf(q.body)]));
    expect(actual).toEqual(DEMANDS);
  });

  it('표에 남은 이름이 실제로 있는 조회다', () => {
    // 조회를 지우고 표만 남으면, 그 줄은 아무것도 지키지 않으면서 지키는 척한다
    const names = new Set(guarded.map((q) => q.name));
    expect(Object.keys(DEMANDS).filter((n) => !names.has(n))).toEqual([]);
  });

  it('가맹점이 못 갖는 권한을 묻는 조회는 가맹점에게 닫힌다', () => {
    /*
     * 표에 적은 권한이 **실제로 가맹점을 막는지**를 권한표에 물어 본다. 이름만 맞게 적어 두고
     * 그 권한이 가맹점에게도 있으면 적어 둔 뜻이 없다.
     */
    const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
    const mine = new Set(permissionsOf('MERCHANT'));
    const platformOnly = Object.entries(DEMANDS).filter(([, perm]) => !mine.has(perm));

    for (const [name, perm] of platformOnly) {
      expect(() => assertAdminQuery(merchant, perm), name).toThrow(ForbiddenError);
    }

    // 플랫폼 전용이 실제로 있는지, 그리고 이 둘이 그 안에 있는지 — 훑기가 헛돌면 빈 목록도 통과한다
    const names = platformOnly.map(([name]) => name);
    expect(names).toContain('getErrorGroups');
    expect(names).toContain('getAdminPointAccount');
  });
});
