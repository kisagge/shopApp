import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 끝난 일의 알림을 읽음으로 남긴다.
 *
 * **운영 알림함은 쌓이는 만큼 비워지지 않았다.** 주소가 바뀌었다는 알림은 그 주문을 보낸 뒤에도,
 * 반품지가 없다는 알림은 등록한 뒤에도 안 읽음으로 남았다 — 그러면 뱃지의 숫자가 "할 일이 몇 개" 가
 * 아니라 "그동안 몇 번 일이 있었나" 가 되고, 그 숫자를 아무도 보지 않게 된다.
 *
 * **지우지 않고 읽음으로 남긴다** — 무슨 일이 있었는지는 알림함을 거슬러 올라가 볼 수 있어야 한다.
 */

const db = vi.hoisted(() => ({
  notification: { updateMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { markNoticesDone } = await import('~/lib/notifications/record');

const where = () => db.notification.updateMany.mock.calls[0]![0].where as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.updateMany.mockResolvedValue({ count: 1 });
});

describe('무엇에 대한 알림인가로 좁히기', () => {
  it('params 의 한 칸으로 고른다', async () => {
    await markNoticesDone({
      kinds: ['ORDER_ADDRESS_CHANGED'],
      about: { key: 'orderNo', value: '20261005-0000001' },
    });

    expect(where()).toEqual({
      kind: { in: ['ORDER_ADDRESS_CHANGED'] },
      readAt: null,
      params: { path: ['orderNo'], equals: '20261005-0000001' },
    });
    expect(db.notification.updateMany.mock.calls[0]![0].data.readAt).toBeInstanceOf(Date);
  });

  /** 읽은 시각이 뒤로 밀리면, 언제 알아차렸는지가 거짓이 된다 */
  it('이미 읽은 것은 건드리지 않는다', async () => {
    await markNoticesDone({ kinds: ['ORDER_ADDRESS_CHANGED'], about: { key: 'orderNo', value: 'x' } });

    expect(where()['readAt']).toBeNull();
  });
});

describe('누구의 알림함인가로 좁히기', () => {
  it('받는 사람으로 고른다', async () => {
    await markNoticesDone({ kinds: ['RETURN_ADDRESS_MISSING'], userIds: ['u-1', 'u-2'] });

    expect(where()).toMatchObject({ userId: { in: ['u-1', 'u-2'] } });
  });

  it('받는 사람이 없으면 아무것도 하지 않는다 — 조건 없는 updateMany 가 되면 안 된다', async () => {
    await markNoticesDone({ kinds: ['RETURN_ADDRESS_MISSING'], userIds: [] });

    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('좁히지 못하면 하지 않는다', () => {
  /** 둘 다 없으면 그 종류 전체를 읽음으로 만든다 — 남의 할 일까지 지운다 */
  it('무엇에 대한 것도, 누구의 것도 모르면 하지 않는다', async () => {
    await markNoticesDone({ kinds: ['ORDER_ADDRESS_CHANGED'] });

    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });

  it('종류가 없으면 하지 않는다', async () => {
    await markNoticesDone({ kinds: [], about: { key: 'orderNo', value: 'x' } });

    expect(db.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe('실패', () => {
  it('못 남겨도 던지지 않는다 — 본 일은 이미 끝났다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.notification.updateMany.mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(
      markNoticesDone({ kinds: ['ORDER_ADDRESS_CHANGED'], about: { key: 'orderNo', value: 'x' } }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
