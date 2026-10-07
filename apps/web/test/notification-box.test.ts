import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONSOLE_NEWS_KIND, CONSOLE_NOTIFICATION_KIND } from '@shop/core';

/**
 * 매장 알림함과 운영 알림함이 서로를 건드리지 않는다.
 *
 * 한 표를 둘이 쓴다 — 가맹점 계정도 사용자라 두 곳에 다 들어간다. 그래서
 * **읽기·세기·읽음 처리** 셋이 모두 알림함을 가려야 한다. 하나라도 빠지면:
 *
 * - 읽기가 새면 매장 알림함에 "재고 부족" 이 뜬다
 * - 세기가 새면 매장 머리의 뱃지가 할 일 아닌 것으로 찬다
 * - **읽음 처리가 새면 매장에 들렀다 가는 것만으로 재고 알림이 사라진다**
 *
 * 마지막 것이 실제로 새고 있었다. 알림함이 하나일 때는 종류를 가리지 않는 것이
 * 맞았는데, 둘이 되자 그 창구가 운영 알림까지 읽음으로 적었다.
 */

const notification = vi.hoisted(() => ({
  findMany: vi.fn<(...a: any[]) => any>(),
  count: vi.fn<(...a: any[]) => any>(),
  updateMany: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: { notification } }));

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getSessionUser = session.getSessionUser;

const { getMyNotifications, countUnread } = await import('~/lib/queries/notifications');
const { POST: markRead } = await import('~/app/api/notifications/read/route');

const kindsIn = (call: unknown[] | undefined): string[] =>
  (call?.[0] as { where: { kind: { in: string[] } } }).where.kind.in;

beforeEach(() => {
  notification.findMany.mockReset().mockResolvedValue([]);
  notification.count.mockReset().mockResolvedValue(0);
  notification.updateMany.mockReset().mockResolvedValue({ count: 0 });
  getSessionUser.mockReset().mockResolvedValue({ id: 'u-1' });
});

describe('읽기', () => {
  it('매장 알림함에는 재고 부족이 없다', async () => {
    await getMyNotifications('u-1');
    expect(kindsIn(notification.findMany.mock.calls[0])).not.toContain('STOCK_LOW');
  });

  it('운영 알림함에는 운영 몫만 있다', async () => {
    /*
     * 목록을 여기 손으로 적지 않는다. 한동안 재고 부족 하나뿐이었는데 검수
     * 결과가 더해졌고, 손으로 적어 두면 종류를 더할 때마다 여기가 함께 틀린다.
     * 가리는 규칙 자체(둘이 겹치지 않고 합치면 전체)는 core 검사가 본다.
     */
    await getMyNotifications('u-1', 'console');
    expect(kindsIn(notification.findMany.mock.calls[0])).toEqual([...CONSOLE_NOTIFICATION_KIND]);
  });

  it('검수 결과는 매장 알림함에 뜨지 않는다 — 손님으로 온 자리에서 들을 말이 아니다', async () => {
    await getMyNotifications('u-1');
    const kinds = kindsIn(notification.findMany.mock.calls[0]);
    expect(kinds).not.toContain('PRODUCT_APPROVED');
    expect(kinds).not.toContain('PRODUCT_REJECTED');
  });
});

describe('세기', () => {
  it('매장 뱃지는 재고 부족을 세지 않는다', async () => {
    await countUnread('u-1');
    expect(kindsIn(notification.count.mock.calls[0])).not.toContain('STOCK_LOW');
  });

  it('운영 뱃지는 운영 몫을 센다', async () => {
    await countUnread('u-1', 'console');
    expect(kindsIn(notification.count.mock.calls[0])).toEqual([...CONSOLE_NOTIFICATION_KIND]);
  });
});

describe('읽음 처리', () => {
  it('매장 알림함을 열어도 운영 알림은 읽음이 되지 않는다', async () => {
    /*
     * **여기가 이 파일의 요점이다.** 가맹점이 매장에 들렀다 가는 것만으로
     * 재고 부족 뱃지가 아무 말 없이 사라지면, 읽지도 않은 것을 읽었다고
     * 적는 셈이다 — 그리고 품절은 그렇게 놓친다.
     */
    await markRead(new Request('http://localhost/api/notifications/read', { method: 'POST' }));

    const kinds = kindsIn(notification.updateMany.mock.calls[0]);
    expect(kinds, '매장에서 연 알림함이 운영 알림까지 읽음으로 만든다').not.toContain('STOCK_LOW');
  });

  /**
   * **운영 알림함을 열면 소식만 읽힌다.**
   *
   * 거기에는 할 일과 소식이 섞여 있다. 할 일까지 읽음으로 만들면 아직 처리하지 않은 일이 알림함에서
   * 사라지고, 반대로 소식을 남기면 아무도 닫지 않아 영영 쌓인다(보존 규칙은 읽은 것만 지운다).
   */
  it('운영 알림함을 열면 소식만 읽음이 된다 — 할 일은 남는다', async () => {
    await markRead(
      new Request('http://localhost/api/notifications/read?box=console', { method: 'POST' }),
    );

    const kinds = kindsIn(notification.updateMany.mock.calls[0]);
    expect(kinds).toEqual([...CONSOLE_NEWS_KIND]);
    expect(kinds, '열어 본 것만으로 재고 할 일이 읽음이 됐다').not.toContain('STOCK_LOW');
    expect(kinds).not.toContain('RETURN_REQUESTED');
  });

  it('모르는 알림함 이름은 매장으로 본다', async () => {
    // 아무 값이나 넣어서 운영 알림을 지우는 길이 생기면 안 된다
    await markRead(
      new Request('http://localhost/api/notifications/read?box=everything', { method: 'POST' }),
    );
    expect(kindsIn(notification.updateMany.mock.calls[0])).not.toContain('STOCK_LOW');
  });
});

/**
 * **고른 줄만 닫는다.**
 *
 * 운영 알림함은 할 일 목록이라 열었다고 끝난 것이 아니다 — 사람이 끝낸 줄을 하나씩 닫는다. 그 창구가
 * 아무 줄이나 닫을 수 있으면 남의 알림함이나 다른 알림함의 뱃지를 지우는 길이 된다.
 */
describe('줄을 골라 읽음 처리', () => {
  const body = (payload: unknown, box = 'console') =>
    new Request(`http://localhost/api/notifications/read?box=${box}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  const where = () => notification.updateMany.mock.calls[0]![0].where as Record<string, any>;

  /** 고른 줄은 사람이 "끝났다" 고 누른 것이다 — 할 일도 닫는다 */
  it('고른 줄이면 할 일도 닫는다', async () => {
    await markRead(body({ ids: ['clh1abc2300000000000000001'] }));

    expect(kindsIn(notification.updateMany.mock.calls[0])).toEqual([...CONSOLE_NOTIFICATION_KIND]);
  });

  it('고른 줄만 읽음으로 만든다', async () => {
    await markRead(body({ ids: ['clh1abc2300000000000000001', 'clh1abc2300000000000000002'] }));

    expect(where()['id']).toEqual({
      in: ['clh1abc2300000000000000001', 'clh1abc2300000000000000002'],
    });
    expect(where()['readAt']).toBeNull();
  });

  /** id 를 받아도 이 조건은 그대로 걸린다 — 남의 알림 id 를 적어 보내도 닿지 않는다 */
  it('남의 알림함은 건드릴 수 없다', async () => {
    await markRead(body({ ids: ['clh1abc2300000000000000001'] }));

    expect(where()['userId']).toBe('u-1');
  });

  /** 고른 줄이라도 그 알림함의 종류여야 한다 — 매장 창구로 운영 뱃지를 지울 수 없다 */
  it('고른 줄도 그 알림함의 종류여야 한다', async () => {
    await markRead(body({ ids: ['clh1abc2300000000000000001'] }, 'customer'));

    expect(kindsIn(notification.updateMany.mock.calls[0])).not.toContain('STOCK_LOW');
  });

  it('줄을 고르지 않으면 그 알림함 전체다 — 매장이 그렇게 부른다', async () => {
    await markRead(body({}));

    expect(where()['id']).toBeUndefined();
  });

  it('본문이 없어도 된다 — 배포 사이에 열려 있던 화면의 뱃지가 안 지워지면 안 된다', async () => {
    await markRead(new Request('http://localhost/api/notifications/read', { method: 'POST' }));

    expect(notification.updateMany).toHaveBeenCalledTimes(1);
  });

  it('빈 목록이면 아무것도 하지 않는다 — 조건 없는 updateMany 가 되면 안 된다', async () => {
    const res = await markRead(body({ ids: [] }));

    expect(await res.json()).toEqual({ marked: 0 });
    expect(notification.updateMany).not.toHaveBeenCalled();
  });

  it('id 모양이 아니면 거절한다', async () => {
    const res = await markRead(body({ ids: ['../../etc/passwd'] }));

    expect(res.status).toBe(400);
    expect(notification.updateMany).not.toHaveBeenCalled();
  });

  it('JSON 이 아니면 거절한다', async () => {
    const res = await markRead(new Request('http://localhost/api/notifications/read?box=console', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{ 망가진',
    }));

    expect(res.status).toBe(400);
    expect(notification.updateMany).not.toHaveBeenCalled();
  });

  it('로그인하지 않으면 401', async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await markRead(body({ ids: ['clh1abc2300000000000000001'] }))).status).toBe(401);
    expect(notification.updateMany).not.toHaveBeenCalled();
  });
});
