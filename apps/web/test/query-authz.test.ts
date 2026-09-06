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
    const dir = join(process.cwd(), 'src/lib/queries/admin');
    const src = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    const missing: string[] = [];

    for (const m of src.matchAll(/export async function (\w+)\s*\(([\s\S]*?)\)[^{]*\{/g)) {
      const [, name, args] = m;
      if (!args?.includes('Actor')) continue;
      const at = (m.index ?? 0) + m[0].length;
      const body = src.slice(at, at + 800);
      // 공용 가드(assertAdminQuery)든 직접 확인이든, 무엇이든 보아야 한다
      const guarded = body.includes('assertAdminQuery') || body.includes('assertPermission');
      if (!guarded) missing.push(name!);
    }

    expect(missing).toEqual([]);
  });
});
