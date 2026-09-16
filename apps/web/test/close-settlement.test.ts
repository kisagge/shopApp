import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  merchant: { findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { groupBy: vi.fn<(...a: any[]) => any>() },
  settlement: { findMany: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>(), updateMany: vi.fn<(...a: any[]) => any>() },
  // 알림을 진짜로 남기는 길을 함께 본다 — 모듈을 흉내 내면 "안 부른다" 를 못 잡는다
  user: { findMany: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { previewSettlements, closeSettlements, paySettlement } =
  await import('~/lib/admin/close-settlement');

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

/** 2026-08 이 끝난 뒤 */
const AFTER = new Date('2026-09-02T00:00:00Z');
/** 2026-08 진행 중 */
const DURING = new Date('2026-08-15T00:00:00Z');

/** 가맹점에 소속된 계정. 알림이 여기로 간다 */
let staff: { id: string; merchantId: string }[];

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findMany.mockResolvedValue([
    { id: 'm-a', name: '무어', commissionPercent: 15 },
    { id: 'm-b', name: '스튜디오눈', commissionPercent: 10 },
  ]);
  db.orderItem.groupBy
    .mockResolvedValueOnce([
      { merchantId: 'm-a', _sum: { subtotal: 1_000_000 }, _count: { _all: 4 } },
      { merchantId: 'm-b', _sum: { subtotal: 500_000 }, _count: { _all: 2 } },
    ])
    .mockResolvedValueOnce([{ merchantId: 'm-a', _sum: { subtotal: 100_000 } }]);
  db.settlement.findMany.mockResolvedValue([]);
  db.settlement.upsert.mockResolvedValue({ id: 's-1' });
  // where 를 흉내 낸다 — 그냥 전부 돌려주면 "남의 가맹점에는 안 간다" 가 검사되지 않는다
  staff = [{ id: 'u-moore', merchantId: 'm-a' }, { id: 'u-noon', merchantId: 'm-b' }];
  db.user.findMany.mockImplementation(async (args: any) =>
    staff.filter((s) => (args.where.merchantId.in as string[]).includes(s.merchantId)));
  db.notification.createMany.mockResolvedValue({ count: 1 });
});

/** 방금 남긴 알림들 — createMany 에 실려 간 줄 */
const notices = () => db.notification.createMany.mock.calls.flatMap((c) => c[0].data as any[]);

describe('초안 계산', () => {
  it('가맹점별로 매출·수수료·환불을 묶는다', async () => {
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      merchantName: '무어',
      grossAmount: 1_000_000,
      commissionAmount: 150_000,
      refundAmount: 100_000,
      netAmount: 750_000,
      orderCount: 4,
    });
  });

  it('환불이 없는 가맹점은 0 으로 잡는다', async () => {
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts[1]).toMatchObject({ refundAmount: 0, netAmount: 450_000 });
  });

  it('매출은 구매확정 시각으로 자른다 — 결제 시각이 아니다', async () => {
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(where.order.confirmedAt.gte.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(where.order.confirmedAt.lt.toISOString()).toBe('2026-08-31T15:00:00.000Z');
  });

  /**
   * 정산 매출로 잡는 것은 구매확정된 주문뿐이다. 확정 전에 취소된 주문은
   * 정산에 실린 적이 없으므로, 그것을 빼면 가맹점이 **다른 주문으로 번 돈에서**
   * 받은 적 없는 금액만큼 깎인다. 전에는 `paidAt` 만 봐서 실제로 그랬다.
   */
  it('판매는 지금 주문 상태를 보지 않는다 — 확정 뒤 반품된 주문이 판 달에서 빠지지 않는다', async () => {
    /*
     * 예전에는 "구매확정 상태인 주문" 이었다. 확정 뒤 주문째 반품·환불되면 상태가 환불완료가 되어
     * 그 달 판매에서 빠지고, 차감에는 잡혔다 — 같은 달이면 두 번 깎인다. 반품을 접수만 해도 빠졌다.
     */
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(where.order.status).toBeUndefined();
  });

  it('차감은 확정 뒤에 돈이 돌아간 줄만 — 줄이 스스로 기억한다', async () => {
    /*
     * 예전에는 "환불 상태 주문 + 확정된 적 있음" 이었다. 한 줄만 반품한 구매확정 주문은 환불
     * 상태가 아니라서 차감에서 빠졌다.
     */
    await previewSettlements(admin, '2026-08');
    const where = db.orderItem.groupBy.mock.calls[1]?.[0].where;
    expect(where.refundedAfterConfirm).toBe(true);
    expect(where.canceledAt.gte.toISOString()).toBe('2026-07-31T15:00:00.000Z');
    expect(where.order, '주문 상태로 가르면 일부 반품이 빠진다').toBeUndefined();
  });

  it('판매에서 빼는 것은 확정 전에 돌아간 줄뿐이다', async () => {
    /*
     * 출고 전 일부 취소는 판 적이 없다. 확정 뒤 반품은 이 달에 판 것이 맞다 — 빼면 이미 지급한
     * 달의 판매가 줄고, 차감은 영영 안 된다. 같은 돈을 더하고 빼지도, 한쪽만 하지도 않는다.
     */
    await previewSettlements(admin, '2026-08');
    const sale = db.orderItem.groupBy.mock.calls[0]?.[0].where;
    expect(sale.OR).toEqual([{ canceledAt: null }, { refundedAfterConfirm: true }]);
  });

  it('가맹점은 자기 것만 본다', async () => {
    await previewSettlements(merchant, '2026-08');
    expect(db.merchant.findMany.mock.calls[0]?.[0].where).toEqual({ id: 'm-a' });
  });

  it('고객은 볼 수 없다', async () => {
    await expect(previewSettlements(customer, '2026-08')).rejects.toThrow();
  });

  it('이미 확정된 기간이면 그 상태를 함께 준다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'PAID' }]);
    const drafts = await previewSettlements(admin, '2026-08');
    expect(drafts[0]?.existingStatus).toBe('PAID');
    expect(drafts[1]?.existingStatus).toBeNull();
  });
});

describe('기간 확정', () => {
  it('가맹점은 확정할 수 없다', async () => {
    await expect(closeSettlements(merchant, '2026-08', AFTER)).rejects.toThrow();
    expect(db.settlement.upsert).not.toHaveBeenCalled();
  });

  it('진행 중인 기간은 확정할 수 없다 — 매출이 잘린다', async () => {
    await expect(closeSettlements(admin, '2026-08', DURING)).rejects.toMatchObject({
      code: 'PERIOD_NOT_CLOSED', status: 409,
    });
    expect(db.settlement.upsert).not.toHaveBeenCalled();
  });

  it('끝난 기간을 가맹점 수만큼 기록한다', async () => {
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(db.settlement.upsert).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 2, updated: 0, skipped: [] });
  });

  it('같은 가맹점·기간은 유니크 키로 덮어쓴다 — 두 번 돌아도 행이 늘지 않는다', async () => {
    await closeSettlements(admin, '2026-08', AFTER);
    const args = db.settlement.upsert.mock.calls[0]?.[0];
    expect(args.where.merchantId_periodStart_periodEnd.merchantId).toBe('m-a');
    expect(args.create.grossAmount).toBe(1_000_000);
    expect(args.update.status).toBe('CONFIRMED');
  });

  it('이미 확정된 것은 다시 계산하지 않는다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'CONFIRMED' }]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(result.skipped).toEqual(['무어']);
    expect(db.settlement.upsert).toHaveBeenCalledTimes(1);
  });

  it('지급된 것은 절대 건드리지 않는다', async () => {
    db.settlement.findMany.mockResolvedValue([
      { merchantId: 'm-a', status: 'PAID' }, { merchantId: 'm-b', status: 'PAID' },
    ]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(db.settlement.upsert).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(2);
  });

  it('보류(HELD)는 다시 계산한다', async () => {
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'HELD' }]);
    const result = await closeSettlements(admin, '2026-08', AFTER);
    expect(result).toMatchObject({ created: 1, updated: 1, skipped: [] });
  });

  it('확정은 가맹점 범위를 무시하고 전체를 본다', async () => {
    // 관리자에게 merchantId 가 붙어 있어도 플랫폼 전체를 정산한다
    await closeSettlements({ ...admin, merchantId: 'm-a' }, '2026-08', AFTER);
    expect(db.merchant.findMany.mock.calls[0]?.[0].where).toEqual({});
  });

  it('그때의 수수료율을 함께 얼린다', async () => {
    /*
     * 금액만 얼려 두면 "몇 퍼센트였는가" 에 답할 것이 없다 — 요율을 바꾼 뒤 지난 기간의 내역을 내려받으면
     * 새 요율로 다시 계산돼 확정된 행과 어긋났다.
     */
    await closeSettlements(admin, '2026-08', AFTER);
    const written = db.settlement.upsert.mock.calls[0]?.[0];
    expect(written.create.commissionPercent).toBe(15);
    expect(written.update.commissionPercent).toBe(15);
  });

  it('형식이 틀린 기간은 거절한다', async () => {
    await expect(closeSettlements(admin, '2026-13', AFTER)).rejects.toThrow();
  });
});

/**
 * 마감·지급 알림.
 *
 * 마감은 배치가 새벽에 돌고 지급은 운영진이 누른다 — 둘 다 가맹점이 없는 자리에서
 * 일어나는 일이라, 지금까지는 정산 화면을 열어 뱃지가 바뀐 것을 보고서야 알았다.
 */
describe('마감을 알린다', () => {
  it('가맹점마다 지급 예정액과 기간을 실어 보낸다', async () => {
    await closeSettlements(admin, '2026-08', AFTER);

    expect(notices()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        userId: 'u-moore',
        kind: 'SETTLEMENT_CLOSED',
        params: { period: '2026-08', amount: '750,000' },
        linkPath: '/admin/settlements',
      }),
    ]));
  });

  it('그 가맹점에 소속된 계정 전부에게 간다 — 누가 돈을 챙기는지 우리는 모른다', async () => {
    staff.push({ id: 'u-moore-2', merchantId: 'm-a' });

    await closeSettlements(admin, '2026-08', AFTER);

    expect(notices().filter((n) => n.params.amount === '750,000').map((n) => n.userId))
      .toEqual(['u-moore', 'u-moore-2']);
    expect(db.user.findMany.mock.calls[0]?.[0].where.role).toBe('MERCHANT');
  });

  it('남의 가맹점 금액이 섞이지 않는다', async () => {
    await closeSettlements(admin, '2026-08', AFTER);

    const noon = notices().find((n) => n.userId === 'u-noon');
    expect(noon.params.amount).toBe('450,000');
  });

  it('처음 확정될 때만 알린다 — 배치는 재실행되기 마련이다', async () => {
    /*
     * 다시 돌 때마다 알리면 같은 달 정산이 알림함에 여러 번 쌓여서, 두 번째부터는
     * 아무도 읽지 않는다. 보류(HELD)를 다시 계산해 덮어쓰는 경우가 그렇다.
     */
    db.settlement.findMany.mockResolvedValue([{ merchantId: 'm-a', status: 'HELD' }]);

    await closeSettlements(admin, '2026-08', AFTER);

    expect(notices().map((n) => n.userId)).toEqual(['u-noon']);
  });

  it('오간 것이 없는 달은 알리지 않는다 — 장부에는 남는다', async () => {
    // 쉬고 있는 가맹점에 매달 "0원이 확정되었습니다" 가 가면 알림함에 읽을 것이 없어진다
    db.orderItem.groupBy.mockReset();
    db.orderItem.groupBy.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const result = await closeSettlements(admin, '2026-08', AFTER);

    expect(result.created, '장부에는 두 줄 다 쓴다').toBe(2);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('환불만 있어 지급액이 음수인 달은 알린다', async () => {
    /*
     * 오간 것이 없어서 0원인 것과, 물러난 돈이 있어서 마이너스인 것은 전혀 다른 소식이다 —
     * 음수는 다음 달에 받아야 할 돈이라 오히려 먼저 알아야 한다.
     */
    db.orderItem.groupBy.mockReset();
    db.orderItem.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ merchantId: 'm-a', _sum: { subtotal: 90_000 } }]);

    await closeSettlements(admin, '2026-08', AFTER);

    const moore = notices().find((n) => n.userId === 'u-moore');
    expect(moore.params.amount).toBe('-90,000');
  });

  it('알림을 못 남겨도 마감은 끝난 것이다', async () => {
    // 정산은 이미 확정됐다. 알림 하나 때문에 그것을 무를 수는 없다
    db.user.findMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(closeSettlements(admin, '2026-08', AFTER)).resolves.toMatchObject({ created: 2 });
  });
});

describe('지급을 알린다', () => {
  const payee = {
    name: '무어',
    settlementBank: 'KB', settlementAccount: '12345678901', settlementHolder: '무어',
  };

  beforeEach(() => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: 750_000, merchant: payee,
      merchantId: 'm-a', periodStart: new Date('2026-07-31T15:00:00Z'),
    });
    db.settlement.updateMany.mockResolvedValue({ count: 1 });
  });

  it('돈을 보낸 뒤에 그 가맹점에게 알린다', async () => {
    await paySettlement(superAdmin, 's-1');

    expect(notices()).toEqual([expect.objectContaining({
      userId: 'u-moore',
      kind: 'SETTLEMENT_PAID',
      params: { period: '2026-08', amount: '750,000' },
      linkPath: '/admin/settlements',
    })]);
    expect(db.user.findMany.mock.calls[0]?.[0].where.merchantId).toEqual({ in: ['m-a'] });
  });

  it('어느 달 정산인지를 KST 로 읽는다', async () => {
    /*
     * 8월 정산의 시작 시각은 7월 31일 15:00 UTC 다. UTC 로 읽으면 알림이
     * "2026-07 정산금이 지급되었습니다" 라고 말한다.
     */
    await paySettlement(superAdmin, 's-1');
    expect(notices()[0].params.period).toBe('2026-08');
  });

  it('지급이 막히면 알리지도 않는다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: 750_000,
      merchantId: 'm-a', periodStart: new Date('2026-07-31T15:00:00Z'),
      merchant: { ...payee, settlementAccount: null },
    });

    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('동시에 두 번 눌러도 알림은 한 번뿐이다', async () => {
    // 진 쪽은 조건부 UPDATE 가 0행을 고쳐 ALREADY_PAID 로 끝난다 — 상태를 바꾼 뒤에 알리는 이유다
    db.settlement.updateMany.mockResolvedValue({ count: 0 });

    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'ALREADY_PAID' });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('알림을 못 남겨도 지급은 나간 것이다', async () => {
    db.user.findMany.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(paySettlement(superAdmin, 's-1')).resolves.toMatchObject({ status: 'PAID' });
  });
});

describe('지급 집행', () => {
  /** 돈을 보낼 수 있는 가맹점 — 계좌가 없으면 지급 자체가 막힌다 */
  const payee = {
    name: '무어',
    settlementBank: 'KB', settlementAccount: '12345678901', settlementHolder: '무어',
  };

  beforeEach(() => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: 750_000, merchant: payee,
      merchantId: 'm-a', periodStart: new Date('2026-07-31T15:00:00Z'),
    });
    db.settlement.updateMany.mockResolvedValue({ count: 1 });
  });

  it('정산 계좌가 없으면 지급할 수 없다', async () => {
    /*
     * 스키마에는 계좌 칸이 처음부터 있었는데 읽는 곳이 없어서, 한 번도 적지 않은 가맹점의 정산도 눌러 지급이 됐다 —
     * 돈이 어디로 갔다는 말인지 아무도 답할 수 없는 기록이다.
     */
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: 750_000,
      merchant: { ...payee, settlementAccount: null },
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'NO_ACCOUNT' });
    expect(db.settlement.updateMany).not.toHaveBeenCalled();
  });

  it('관리자에게는 settlement:pay 가 없다 — 확정과 지급을 나눠 뒀다', async () => {
    await expect(paySettlement(admin, 's-1')).rejects.toThrow();
    expect(db.settlement.updateMany).not.toHaveBeenCalled();
  });

  it('슈퍼관리자는 지급할 수 있다', async () => {
    await expect(paySettlement(superAdmin, 's-1')).resolves.toMatchObject({ status: 'PAID' });
  });

  it('확정되지 않은 정산은 지급할 수 없다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'PENDING', netAmount: 1000, merchant: payee,
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'NOT_CONFIRMED' });
  });

  it('이미 지급된 것은 두 번 나가지 않는다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'PAID', netAmount: 1000, merchant: payee,
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'ALREADY_PAID' });
  });

  it('동시에 두 번 눌러도 한 번만 나간다', async () => {
    // 조건부 UPDATE 가 0행을 고치면 다른 요청이 먼저 지급한 것이다
    db.settlement.updateMany.mockResolvedValue({ count: 0 });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({ code: 'ALREADY_PAID' });
    expect(db.settlement.updateMany.mock.calls[0]?.[0].where.status).toBe('CONFIRMED');
  });

  it('지급액이 음수면 자동 집행하지 않는다', async () => {
    db.settlement.findUnique.mockResolvedValue({
      id: 's-1', status: 'CONFIRMED', netAmount: -50_000, merchant: payee,
    });
    await expect(paySettlement(superAdmin, 's-1')).rejects.toMatchObject({
      code: 'NEGATIVE_AMOUNT',
    });
  });

  it('없는 정산은 404', async () => {
    db.settlement.findUnique.mockResolvedValue(null);
    await expect(paySettlement(superAdmin, 's-x')).rejects.toMatchObject({ status: 404 });
  });
});
