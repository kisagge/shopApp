import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 처리할 일을 운영 알림함에 알린다.
 *
 * 운영 알림함에 처리할 일이 오지 않았다 — 반품 신청·문의·입점 신청이 들어와도 목록을 열어 보기 전까지 아무도 몰랐다.
 * 누가 듣는지(core console-audience)가 실제 조회 조건으로 이어지는지, 실패해도 신청을 무르지 않는지 본다.
 */

const db = vi.hoisted(() => ({
  user: { findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { findMany: vi.fn<(...a: any[]) => any>() },
  inquiry: { findUnique: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { notifyReturnRequested, notifyInquiryReceived, notifyMerchantApplied, notifyAddressChanged } =
  await import('~/lib/notifications/console-work');

const where = () => db.user.findMany.mock.calls[0]![0].where as { suspendedAt: null; OR: Record<string, unknown>[] };
const written = () => db.notification.createMany.mock.calls[0]![0].data as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
  db.notification.createMany.mockResolvedValue({ count: 2 });
});

describe('반품·교환 신청', () => {
  it('한 가맹점 줄뿐이면 그 가맹점의 승인된 계정만 듣는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: 'm-a' }]);

    await notifyReturnRequested({ orderNo: '20260917-0000001', itemIds: ['i-1'] });

    expect(db.orderItem.findMany.mock.calls[0]![0].where).toEqual({
      order: { orderNo: '20260917-0000001' }, id: { in: ['i-1'] },
    });
    expect(where().suspendedAt).toBeNull();
    expect(where().OR).toEqual([
      { role: 'MERCHANT', merchantId: { in: ['m-a'] }, merchant: { status: 'APPROVED' } },
    ]);
    expect(written()).toEqual([
      { userId: 'u-1', kind: 'RETURN_REQUESTED', params: { orderNo: '20260917-0000001' }, linkPath: '/admin/orders/20260917-0000001' },
      { userId: 'u-2', kind: 'RETURN_REQUESTED', params: { orderNo: '20260917-0000001' }, linkPath: '/admin/orders/20260917-0000001' },
    ]);
  });

  it('자사 상품 줄이 섞이면 반품을 처리하는 운영 역할도 듣는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: 'm-a' }, { merchantId: null }]);

    await notifyReturnRequested({ orderNo: 'O-1', itemIds: ['i-1', 'i-2'] });

    expect(where().OR).toContainEqual({ role: { in: ['ADMIN', 'SUPER_ADMIN'] } });
  });

  it('알림을 못 남겨도 던지지 않는다 — 신청은 이미 들어왔다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.orderItem.findMany.mockRejectedValue(new Error('db down'));

    await expect(notifyReturnRequested({ orderNo: 'O-1', itemIds: ['i-1'] })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('문의', () => {
  it('가맹점 상품 문의는 그 가맹점이 상품 이름과 함께 듣는다', async () => {
    db.inquiry.findUnique.mockResolvedValue({ product: { name: '울 코트', brand: { merchantId: 'm-a' } } });

    await notifyInquiryReceived('q-1');

    expect(where().OR).toEqual([
      { role: 'MERCHANT', merchantId: { in: ['m-a'] }, merchant: { status: 'APPROVED' } },
    ]);
    expect(written()[0]).toMatchObject({ kind: 'INQUIRY_RECEIVED', params: { productName: '울 코트' }, linkPath: '/admin/inquiries' });
  });

  it('자사 상품 문의는 답하는 운영 역할이 듣는다', async () => {
    db.inquiry.findUnique.mockResolvedValue({ product: { name: '울 코트', brand: { merchantId: null } } });

    await notifyInquiryReceived('q-1');

    expect(where().OR).toEqual([{ role: { in: ['ADMIN', 'SUPER_ADMIN'] } }]);
  });

  it('고객센터 문의는 운영 역할이 듣는다', async () => {
    db.inquiry.findUnique.mockResolvedValue({ product: null });

    await notifyInquiryReceived('q-1');

    expect(where().OR).toEqual([{ role: { in: ['ADMIN', 'SUPER_ADMIN'] } }]);
    expect(written()[0]).toMatchObject({ kind: 'SUPPORT_INQUIRY_RECEIVED', params: {} });
  });

  it('문의가 없으면 아무에게도 보내지 않는다', async () => {
    db.inquiry.findUnique.mockResolvedValue(null);
    await notifyInquiryReceived('q-gone');
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

describe('입점 신청', () => {
  it('입점을 승인할 수 있는 역할만 듣는다 — 관리자는 승인하지 못한다', async () => {
    await notifyMerchantApplied({ merchantName: '새 가게' });

    expect(where().OR).toEqual([{ role: { in: ['SUPER_ADMIN'] } }]);
    expect(written()[0]).toMatchObject({ kind: 'MERCHANT_APPLIED', params: { merchantName: '새 가게' }, linkPath: '/admin/merchants' });
  });

  it('받을 사람이 없으면 아무것도 쓰지 않는다', async () => {
    db.user.findMany.mockResolvedValue([]);
    await notifyMerchantApplied({ merchantName: '새 가게' });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

/**
 * 출고 준비 중인 주문의 배송지가 바뀌었다.
 *
 * **셋을 두었는데 셋 다 열어 봐야 보였다** — 목록의 표시, 상세의 안내, 송장 등록의 확인. 피킹을 시작한
 * 사람은 목록을 다시 열 이유가 없고, 라벨을 이미 찍었다면 그 셋을 모두 지나친다.
 */
describe('배송지 변경', () => {
  it('그 주문을 내보내는 가맹점이 듣는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: 'm-a' }, { merchantId: 'm-a' }]);

    await notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-cust' });

    expect(where().OR).toEqual([
      expect.objectContaining({ role: 'MERCHANT', merchantId: { in: ['m-a'] } }),
    ]);
    expect(written()).toEqual([
      expect.objectContaining({
        userId: 'u-1',
        kind: 'ORDER_ADDRESS_CHANGED',
        linkPath: '/admin/orders/20260930-0000001',
      }),
      expect.objectContaining({ userId: 'u-2' }),
    ]);
  });

  /** 출고는 가맹점마다 자기 줄을 내보낸다 — 섞였다고 남의 몫이 되지 않는다(반품과 다르다) */
  it('여러 가맹점이 섞이면 전부 듣는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: 'm-b' }, { merchantId: 'm-a' }]);

    await notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-cust' });

    expect(where().OR[0]).toMatchObject({ merchantId: { in: ['m-a', 'm-b'] } });
    expect(where().OR, '자사 줄이 없으면 운영진은 빠진다').toHaveLength(1);
  });

  it('자사 줄이 있으면 출고 권한이 있는 운영진도 듣는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: null }]);

    await notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-cust' });

    expect(where().OR).toEqual([expect.objectContaining({ role: { in: expect.any(Array) } })]);
  });

  /** 방금 자기가 한 일이다 */
  it('고친 사람에게는 보내지 않는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: null }]);
    db.user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-admin' }]);

    await notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-admin' });

    expect(written().map((n) => n['userId'])).toEqual(['u-1']);
  });

  /** 취소된 줄의 판매처는 그 물건을 내보내지 않는다 */
  it('취소된 줄은 세지 않는다', async () => {
    db.orderItem.findMany.mockResolvedValue([{ merchantId: 'm-a' }]);

    await notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-cust' });

    expect(db.orderItem.findMany.mock.calls[0]![0].where).toMatchObject({ canceledAt: null });
  });

  it('못 만들어도 던지지 않는다 — 주소는 이미 바뀌었다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.orderItem.findMany.mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(notifyAddressChanged({ orderNo: '20260930-0000001', changedBy: 'u-1' })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
