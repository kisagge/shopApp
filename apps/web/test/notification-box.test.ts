import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONSOLE_NOTIFICATION_KIND } from '@shop/core';

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

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));

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

  it('운영 알림함을 열면 운영 알림만 읽음이 된다', async () => {
    await markRead(
      new Request('http://localhost/api/notifications/read?box=console', { method: 'POST' }),
    );
    expect(kindsIn(notification.updateMany.mock.calls[0])).toEqual([...CONSOLE_NOTIFICATION_KIND]);
  });

  it('모르는 알림함 이름은 매장으로 본다', async () => {
    // 아무 값이나 넣어서 운영 알림을 지우는 길이 생기면 안 된다
    await markRead(
      new Request('http://localhost/api/notifications/read?box=everything', { method: 'POST' }),
    );
    expect(kindsIn(notification.updateMany.mock.calls[0])).not.toContain('STOCK_LOW');
  });
});
