import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LATE_SHIPPING_STATUS, lateShippingBefore, type Actor } from '@shop/core';

/**
 * **돈을 받고도 못 보낸 주문** — 세는 쪽(대시보드)과 보여 주는 쪽(목록)이 조건 하나를 쓴다.
 *
 * 목록에는 줄마다 "늦음" 이 적히지만 그것은 주문 목록을 열어야 보인다 — 늦은 줄이 몇인지는 아침에
 * 먼저 알아야 하는 수다. 그래서 대시보드가 세는데, 두 자리가 각자 날을 세면 "3건" 을 눌렀는데 빈
 * 표가 나온다(품절 숫자에서 이미 당했다: 옵션을 세고 필터 없는 목록으로 보냈다).
 */

const db = vi.hoisted(() => ({
  order: { aggregate: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { aggregate: vi.fn<(...a: any[]) => any>(), groupBy: vi.fn<(...a: any[]) => any>() },
  orderRefund: { aggregate: vi.fn<(...a: any[]) => any>() },
  product: { count: vi.fn<(...a: any[]) => any>() },
  payment: { count: vi.fn<(...a: any[]) => any>() },
  merchant: { count: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>() },
  eventLog: { groupBy: vi.fn<(...a: any[]) => any>() },
  $queryRaw: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { sql: (s: unknown) => s, join: (s: unknown) => s, raw: (s: unknown) => s },
}));

const { adminOrderWhere, lateShippingWhere } = await import('~/lib/queries/admin/orders');
const { getDashboard } = await import('~/lib/queries/admin/dashboard');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const NOW = new Date('2026-10-09T03:00:00Z'); // 2026-10-09 12:00 KST

beforeEach(() => {
  vi.clearAllMocks();
  db.order.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { payable: 0 } });
  db.orderRefund.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  db.orderItem.aggregate.mockResolvedValue({ _sum: { subtotal: 0 } });
  db.order.count.mockResolvedValue(0);
  db.product.count.mockResolvedValue(0);
  db.merchant.count.mockResolvedValue(0);
  db.merchant.findUnique.mockResolvedValue({ settlementAccount: '001', returnAddress: { id: 'ra-1' } });
  db.returnAddress.findUnique.mockResolvedValue({ id: 'platform' });
  db.payment.count.mockResolvedValue(0);
  db.order.findMany.mockResolvedValue([]);
  db.orderItem.groupBy.mockResolvedValue([]);
  db.eventLog.groupBy.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe('조건 한 자리', () => {
  it('core 가 정한 상태와 경계를 그대로 묻는다', () => {
    expect(lateShippingWhere(NOW)).toEqual({
      status: { in: [...LATE_SHIPPING_STATUS] },
      paidAt: { lt: lateShippingBefore(NOW) },
    });
  });

  /** 입금 시각이 없는 줄(입금 대기)은 `lt` 가 알아서 뺀다 — 상태 목록에도 없다 */
  it('입금 대기는 상태 목록에 없다', () => {
    expect(lateShippingWhere(NOW).status.in).not.toContain('PENDING');
  });
});

describe('목록 조건', () => {
  it('걸면 조건이 들어간다', () => {
    const where = adminOrderWhere(null, { lateShipping: true }, NOW);

    expect(where).toMatchObject({ AND: [lateShippingWhere(NOW)] });
  });

  it('안 걸면 아무것도 들어가지 않는다', () => {
    expect(adminOrderWhere(null, {}, NOW)).not.toHaveProperty('AND');
  });

  /**
   * 주소는 손으로 고칠 수 있다 — `?status=PAID&late=1` 로 들어오면 **둘 다** 걸려야 한다.
   * 한 칸에 겹쳐 쓰면 나중 것이 앞의 것을 덮어서, 거른 척하고 안 거른 목록이 나온다.
   */
  it('상태 탭과 함께 걸려도 서로 덮지 않는다', () => {
    const where = adminOrderWhere(null, { status: 'PAID', lateShipping: true }, NOW);

    expect(where).toMatchObject({ status: 'PAID', AND: [lateShippingWhere(NOW)] });
  });

  /** 늦은 발송은 가맹점에게도 자기 일이다(취소 뒤 입금과 다르다 — 그건 플랫폼 계좌의 돈이다) */
  it('가맹점 범위에서도 걸린다 — 자기 가게 범위와 함께', () => {
    const where = adminOrderWhere('m-a', { lateShipping: true }, NOW);

    expect(where).toMatchObject({
      items: { some: { merchantId: 'm-a' } },
      AND: [lateShippingWhere(NOW)],
    });
  });
});

/**
 * **같은 조건으로 센다.** 숫자를 누르면 그 주문들이 나와야 한다.
 */
describe('대시보드가 세는 조건', () => {
  const lateCountCall = () =>
    db.order.count.mock.calls.find(([arg]) => 'paidAt' in (arg as { where: object }).where)?.[0];

  it('목록 필터와 같은 조건이다', async () => {
    await getDashboard(admin, '7d', NOW);

    expect(lateCountCall()).toEqual({ where: lateShippingWhere(NOW) });
  });

  it('가맹점은 자기 주문만 센다', async () => {
    await getDashboard(merchant, '7d', NOW);

    expect(lateCountCall()).toEqual({
      where: { items: { some: { merchantId: 'm-a' } }, ...lateShippingWhere(NOW) },
    });
  });

  it('센 수를 그대로 내놓는다', async () => {
    db.order.count.mockResolvedValue(3);

    const d = await getDashboard(admin, '7d', NOW);

    expect(d.todo.lateShipping).toBe(3);
  });

  /** 화면이 받은 시각으로 센다 — 조회가 스스로 시계를 보면 같은 화면 안에서 날이 갈릴 수 있다 */
  it('받은 시각을 쓴다 — 스스로 시계를 보지 않는다', async () => {
    const yesterday = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

    await getDashboard(admin, '7d', yesterday);

    expect(lateCountCall()).toEqual({ where: lateShippingWhere(yesterday) });
  });
});
