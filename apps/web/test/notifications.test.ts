import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { notificationText } from '~/lib/i18n/notification';

const db = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
    createMany: vi.fn<(...a: any[]) => any>().mockResolvedValue({ count: 0 }),
    count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getMyNotifications, countUnread } = await import('~/lib/queries/notifications');
const { recordNotification, recordNotifications } = await import('~/lib/notifications/record');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'ORDER_SHIPPED',
  params: { orderNo: '20260101-0000001' },
  linkPath: '/order/20260101-0000001',
  readAt: null,
  createdAt: new Date('2026-01-01'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.notification.findMany.mockResolvedValue([]);
  db.notification.createMany.mockResolvedValue({ count: 0 });
});

describe('알림 남기기', () => {
  it('문구를 만들지 않는다 — 나중에 다른 말로 읽을 수 있어야 한다', async () => {
    await recordNotification({
      userId: 'u-1',
      kind: 'ORDER_SHIPPED',
      params: { orderNo: 'A' },
      linkPath: '/order/A',
    });

    const [data] = db.notification.createMany.mock.calls[0]![0].data;
    expect(data).toEqual({
      userId: 'u-1',
      kind: 'ORDER_SHIPPED',
      params: { orderNo: 'A' },
      linkPath: '/order/A',
    });
  });

  it('빈 목록이면 아무것도 하지 않는다', async () => {
    await recordNotifications([]);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('실패해도 던지지 않는다 — 이미 끝난 일을 무를 수는 없다', async () => {
    db.notification.createMany.mockRejectedValue(new Error('DB 오류'));
    await expect(recordNotification({ userId: 'u-1', kind: 'RESTOCKED' })).resolves.toBeUndefined();
  });
});

describe('내 알림 읽기', () => {
  it('내 것만 본다', async () => {
    await getMyNotifications('u-1');
    expect(db.notification.findMany.mock.calls[0]![0].where).toEqual({ userId: 'u-1' });
  });

  it('최근 것이 먼저다', async () => {
    await getMyNotifications('u-1');
    expect(db.notification.findMany.mock.calls[0]![0].orderBy[0]).toEqual({ createdAt: 'desc' });
  });

  it('안 읽음을 표시한다', async () => {
    db.notification.findMany.mockResolvedValue([row(), row({ id: 'n-2', readAt: new Date() })]);
    const items = await getMyNotifications('u-1');
    expect(items.map((n) => n.unread)).toEqual([true, false]);
  });

  it('세는 것은 안 읽은 것만이다', async () => {
    await countUnread('u-1');
    expect(db.notification.count.mock.calls[0]![0].where).toEqual({ userId: 'u-1', readAt: null });
  });

  describe('저장된 값을 그대로 믿지 않는다', () => {
    it('바깥 주소로는 보내지 않는다', async () => {
      // 우리 도메인이 남의 사이트로 보내 주는 발판이 되면 안 된다
      db.notification.findMany.mockResolvedValue([
        row({ linkPath: 'https://evil.example/steal' }),
        row({ id: 'n-2', linkPath: '//evil.example' }),
        row({ id: 'n-3', linkPath: '/order/A' }),
      ]);

      const items = await getMyNotifications('u-1');

      expect(items.map((n) => n.linkPath)).toEqual([null, null, '/order/A']);
    });

    it('문자열이 아닌 값은 문구에 끼우지 않는다', async () => {
      db.notification.findMany.mockResolvedValue([row({ params: { a: 1, b: 'ok', c: null } })]);
      expect((await getMyNotifications('u-1'))[0]!.params).toEqual({ b: 'ok' });
    });

    it('params 가 통째로 없어도 무너지지 않는다', async () => {
      db.notification.findMany.mockResolvedValue([row({ params: null })]);
      expect((await getMyNotifications('u-1'))[0]!.params).toEqual({});
    });
  });
});

describe('문장 만들기', () => {
  const ko = createTranslator('ko');

  it('값을 자리에 넣는다', () => {
    expect(notificationText(ko, 'ORDER_SHIPPED', { orderNo: 'A-1' })).toContain('A-1');
  });

  it('값이 빠지면 값 없는 문장으로 물러난다', () => {
    /*
     * 상품이 지워졌거나 옛 알림이 그럴 수 있다. 그때 자리표시자가 그대로
     * 보이면 안 된다.
     */
    const text = notificationText(ko, 'INQUIRY_ANSWERED', {});
    expect(text).not.toContain('{productName}');
    expect(text).toContain('답변');
  });

  it('세 언어 모두 문장이 나온다', () => {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const t = createTranslator(locale);
      const text = notificationText(t, 'RESTOCKED', { productName: '코트', optionLabel: 'M' });
      expect(text, locale).toContain('코트');
      expect(text, locale).not.toContain('{');
    }
  });
});
