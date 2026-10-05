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
  notification: {
    createMany: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  notifyReturnRequested, notifyInquiryReceived, notifyMerchantApplied, notifyAddressChanged,
  notifyReturnAddressMissing, clearReturnAddressMissing,
} = await import('~/lib/notifications/console-work');

const where = () => db.user.findMany.mock.calls[0]![0].where as { suspendedAt: null; OR: Record<string, unknown>[] };
const written = () => db.notification.createMany.mock.calls[0]![0].data as Record<string, unknown>[];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([{ id: 'u-1' }, { id: 'u-2' }]);
  db.notification.createMany.mockResolvedValue({ count: 2 });
  db.notification.updateMany.mockResolvedValue({ count: 2 });
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

/**
 * 반품 신청이 들어왔는데 보낼 곳이 없다.
 *
 * **승인을 누르려다 막히고 나서야 드러났다.** 누를 생각을 안 하면 영영 드러나지 않고, 그사이 손님의
 * 신청은 대기열에 갇혀 있다 — 손님 화면에는 "승인을 기다리는 중" 만 뜬다.
 */
describe('반품지 미등록', () => {
  it('가맹점 반품지가 없으면 그 가맹점이 듣고, 등록하는 자리로 간다', async () => {
    await notifyReturnAddressMissing({ orderNo: '20261005-0000001', owners: ['m-a'] });

    expect(where().OR).toEqual([
      expect.objectContaining({ role: 'MERCHANT', merchantId: { in: ['m-a'] } }),
    ]);
    expect(written()[0]).toMatchObject({
      kind: 'RETURN_ADDRESS_MISSING',
      linkPath: '/admin/merchants/m-a/return-address',
    });
  });

  /** 자사 상품을 받는 플랫폼 반품지는 가게 전체의 약속이라 배송 정책과 같은 자리에 있다 */
  it('자사 상품이면 운영진이 듣고, 배송비 화면으로 간다', async () => {
    await notifyReturnAddressMissing({ orderNo: '20261005-0000001', owners: [null] });

    expect(where().OR).toEqual([expect.objectContaining({ role: { in: expect.any(Array) } })]);
    expect(written()[0]).toMatchObject({ linkPath: '/admin/shipping' });
  });

  it('판매처가 둘이면 각자에게 각자의 자리로 보낸다', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'u-1' }]);

    await notifyReturnAddressMissing({ orderNo: '20261005-0000001', owners: ['m-a', null] });

    expect(written().map((n) => n['linkPath'])).toEqual([
      '/admin/merchants/m-a/return-address',
      '/admin/shipping',
    ]);
  });

  it('빠진 곳이 없으면 아무것도 묻지 않는다', async () => {
    await notifyReturnAddressMissing({ orderNo: '20261005-0000001', owners: [] });

    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('못 만들어도 던지지 않는다 — 신청은 이미 들어왔다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.user.findMany.mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(notifyReturnAddressMissing({ orderNo: '20261005-0000001', owners: ['m-a'] }))
      .resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});

/**
 * 반품지를 등록하면 **"보낼 곳이 없다" 는 끝난 일이다.**
 *
 * 등록한 뒤에도 안 읽음으로 남으면 뱃지의 숫자가 "할 일이 몇 개" 가 아니라 "그동안 몇 번 일이 있었나" 가
 * 되고, 그 숫자를 아무도 보지 않게 된다. 받는 사람으로 좁힌다 — 한 판매처에 반품지는 한 줄이라, 그 사람
 * 앞으로 온 이 종류는 전부 그 반품지에 대한 것이다.
 */
describe('반품지 미등록 알림을 닫기', () => {
  const closed = () => db.notification.updateMany.mock.calls[0]![0].where as Record<string, unknown>;

  it('가맹점 반품지를 등록하면 그 가맹점의 알림이 읽음이 된다', async () => {
    await clearReturnAddressMissing('m-a');

    expect(where().OR).toEqual([
      expect.objectContaining({ role: 'MERCHANT', merchantId: { in: ['m-a'] } }),
    ]);
    expect(closed()).toMatchObject({
      kind: { in: ['RETURN_ADDRESS_MISSING'] },
      readAt: null,
      userId: { in: ['u-1', 'u-2'] },
    });
  });

  /** 알릴 때와 같은 사람을 찾아야 한다 — 두 쪽이 갈리면 "알림은 왔는데 닫히지 않는" 칸이 생긴다 */
  it('자사 상품 반품지를 등록하면 운영진의 알림이 읽음이 된다', async () => {
    await clearReturnAddressMissing(null);

    expect(where().OR).toEqual([expect.objectContaining({ role: { in: expect.any(Array) } })]);
    expect(closed()['userId']).toEqual({ in: ['u-1', 'u-2'] });
  });

  it('들을 사람이 없으면 아무것도 하지 않는다 — 조건 없는 updateMany 가 되면 안 된다', async () => {
    db.user.findMany.mockResolvedValue([]);

    await clearReturnAddressMissing('m-a');

    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('못 닫아도 던지지 않는다 — 반품지는 이미 등록됐다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.user.findMany.mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(clearReturnAddressMissing('m-a')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
