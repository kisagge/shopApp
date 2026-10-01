import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 손님에게 보여 줄 **보낼 곳**.
 *
 * 승인했고 아직 도착하지 않았을 때만 보여 준다(core showsReturnAddress). 판매처가 둘이면 상자도 둘이라
 * 주소도 둘이다 — 한 주소만 적어 주면 한쪽 물건이 남의 창고로 간다.
 *
 * **그리고 안내한 뒤에 바뀐 주소를 짚어 준다.** 반품지가 바뀌면 손님에게 알림이 가는데, 그 알림을 누르고
 * 들어오면 주소 한 벌이 있을 뿐이다 — 상자에 적어 둔 것이 옛 것인지 이것이 새 것인지 알 수 없다.
 */

const db = vi.hoisted(() => ({
  returnAddress: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { approvedReturnDestinations } = await import('~/lib/orders/return-address');

const APPROVED_AT = new Date('2026-09-10T00:00:00Z');

const row = (merchantId: string | null, updatedAt: Date) => ({
  merchantId,
  recipient: '반품담당',
  phone: '010-0000-0101',
  postalCode: '04799',
  address1: '서울 성동구 성수이로 00',
  address2: '1층',
  updatedAt,
});

const items = [
  { id: 'i-1', status: 'RETURN_REQUESTED', canceledAt: null, merchantId: 'm-a' },
  { id: 'i-2', status: 'DELIVERED', canceledAt: null, merchantId: 'm-b' },
];

const request = (over: Record<string, unknown> = {}) => ({
  status: 'APPROVED',
  receivedAt: null,
  itemIds: ['i-1'],
  resolvedAt: APPROVED_AT,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.returnAddress.findMany.mockResolvedValue([row('m-a', APPROVED_AT)]);
});

describe('보낼 곳', () => {
  it('신청한 줄의 판매처 주소만 읽는다', async () => {
    const found = await approvedReturnDestinations(items, request());

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ merchantId: 'm-a', itemIds: ['i-1'] });
    // 신청하지 않은 줄의 판매처는 묻지 않는다
    expect(db.returnAddress.findMany.mock.calls[0]![0].where.OR)
      .toEqual([{ merchantId: { in: ['m-a'] } }]);
  });

  it('승인 전에는 보여 주지 않는다 — 반려될 신청의 물건을 먼저 보낸다', async () => {
    expect(await approvedReturnDestinations(items, request({ status: 'REQUESTED' }))).toEqual([]);
    expect(db.returnAddress.findMany).not.toHaveBeenCalled();
  });

  it('도착한 뒤에는 보여 주지 않는다 — 보낼 일이 없다', async () => {
    expect(await approvedReturnDestinations(items, request({ receivedAt: new Date() }))).toEqual([]);
  });

  /** 언제 고쳤는지를 읽어야 안내한 뒤에 바뀐 것을 알 수 있다 */
  it('고친 시각까지 읽는다', async () => {
    await approvedReturnDestinations(items, request());

    expect(db.returnAddress.findMany.mock.calls[0]![0].select.updatedAt).toBe(true);
  });

  it('안내한 뒤에 바뀐 주소를 짚어 준다', async () => {
    db.returnAddress.findMany.mockResolvedValue([row('m-a', new Date('2026-09-11T00:00:00Z'))]);

    const found = await approvedReturnDestinations(items, request());

    expect(found[0]!.changedSinceApproval).toBe(true);
  });

  it('안내할 때 그대로면 짚지 않는다 — 늘 붙어 있으면 아무도 읽지 않는다', async () => {
    const found = await approvedReturnDestinations(items, request());

    expect(found[0]!.changedSinceApproval).toBe(false);
  });

  /** 옛 신청에는 승인한 사람도 시각도 안 남아 있다 — 모르는 것을 짚으면 거짓말이 된다 */
  it('승인 시각을 모르면 짚지 않는다', async () => {
    db.returnAddress.findMany.mockResolvedValue([row('m-a', new Date('2026-12-01T00:00:00Z'))]);

    const found = await approvedReturnDestinations(items, request({ resolvedAt: null }));

    expect(found[0]!.changedSinceApproval).toBe(false);
  });
});
