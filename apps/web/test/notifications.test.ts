import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { notificationCutoff } from '@shop/core';
import { notificationText } from '~/lib/i18n/notification';

const db = vi.hoisted(() => ({
  notification: {
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
    createMany: vi.fn<(...a: any[]) => any>().mockResolvedValue({ count: 0 }),
    count: vi.fn<(...a: any[]) => any>().mockResolvedValue(0),
    deleteMany: vi.fn<(...a: any[]) => any>().mockResolvedValue({ count: 0 }),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const {
  getMyNotifications, countUnread, pruneOldNotifications, NOTIFICATION_PAGE_SIZE,
} = await import('~/lib/queries/notifications');
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
    /*
     * 알림함이 둘로 갈린 뒤로 조건에 **종류**가 붙는다(매장은 손님 알림만).
     * 여기서 지키는 것은 여전히 "남의 것을 안 본다" 이므로 userId 를 본다 —
     * 종류 쪽은 notification-box 가 지킨다.
     */
    expect(db.notification.findMany.mock.calls[0]![0].where.userId).toBe('u-1');
  });

  it('최근 것이 먼저다', async () => {
    await getMyNotifications('u-1');
    expect(db.notification.findMany.mock.calls[0]![0].orderBy[0]).toEqual({ createdAt: 'desc' });
  });

  it('안 읽음을 표시한다', async () => {
    db.notification.findMany.mockResolvedValue([row(), row({ id: 'n-2', readAt: new Date() })]);
    const { rows } = await getMyNotifications('u-1');
    expect(rows.map((n) => n.unread)).toEqual([true, false]);
  });

  it('세는 것은 안 읽은 것만이다', async () => {
    await countUnread('u-1');
    expect(db.notification.count.mock.calls[0]![0].where).toMatchObject({
      userId: 'u-1',
      readAt: null,
    });
  });

  describe('저장된 값을 그대로 믿지 않는다', () => {
    it('바깥 주소로는 보내지 않는다', async () => {
      // 우리 도메인이 남의 사이트로 보내 주는 발판이 되면 안 된다
      db.notification.findMany.mockResolvedValue([
        row({ linkPath: 'https://evil.example/steal' }),
        row({ id: 'n-2', linkPath: '//evil.example' }),
        row({ id: 'n-3', linkPath: '/order/A' }),
      ]);

      const { rows } = await getMyNotifications('u-1');

      expect(rows.map((n) => n.linkPath)).toEqual([null, null, '/order/A']);
    });

    it('문자열이 아닌 값은 문구에 끼우지 않는다', async () => {
      db.notification.findMany.mockResolvedValue([row({ params: { a: 1, b: 'ok', c: null } })]);
      expect((await getMyNotifications('u-1')).rows[0]!.params).toEqual({ b: 'ok' });
    });

    it('params 가 통째로 없어도 무너지지 않는다', async () => {
      db.notification.findMany.mockResolvedValue([row({ params: null })]);
      expect((await getMyNotifications('u-1')).rows[0]!.params).toEqual({});
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

describe('쪽 넘기기', () => {
  /*
   * **서른한 번째 알림은 볼 길이 없었다.** 서른 개를 잘라 오고 그게 끝이라, 그
   * 아래는 주소로도 못 갔다 — 알림은 지워지지도 않으니 쌓이기만 했다.
   */
  const args = () => db.notification.findMany.mock.calls.at(-1)![0];

  it('첫 쪽은 건너뛰지 않는다', async () => {
    await getMyNotifications('u-1', 'customer', 1);
    expect(args().skip).toBe(0);
    expect(args().take).toBe(NOTIFICATION_PAGE_SIZE);
  });

  it('둘째 쪽은 한 묶음을 건너뛴다', async () => {
    await getMyNotifications('u-1', 'customer', 2);
    expect(args().skip).toBe(NOTIFICATION_PAGE_SIZE);
  });

  it('쪽을 안 주면 첫 쪽이다 — 부르던 자리가 그대로 돈다', async () => {
    await getMyNotifications('u-1');
    expect(args().skip).toBe(0);
  });

  it('전체 수를 함께 돌려준다 — 그 값이 있어야 쪽 수를 셀 수 있다', async () => {
    db.notification.count.mockResolvedValue(97);
    const page = await getMyNotifications('u-1');
    expect(page.total).toBe(97);
  });

  it('세는 조건이 읽는 조건과 같다 — 다르면 없는 쪽이 생긴다', async () => {
    await getMyNotifications('u-1', 'console');
    const read = db.notification.findMany.mock.calls.at(-1)![0].where;
    const counted = db.notification.count.mock.calls.at(-1)![0].where;
    expect(counted).toEqual(read);
  });

  it('같은 순간에 온 것들도 순서가 흔들리지 않는다', async () => {
    // 재고 부족 알림은 한 번에 여러 건이 적힌다 — createdAt 만으로는 쪽마다 뒤바뀐다
    await getMyNotifications('u-1');
    expect(args().orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('오래된 알림 지우기', () => {
  /*
   * **정책은 진작 적혀 있었는데 아무도 지우지 않았다.** 보존 기간과 자르는 시각이
   * core 에 있고 주석에는 "배치가 지운다" 고 되어 있었지만 부르는 곳이 없었다.
   */
  const NOW = new Date('2026-09-16T00:00:00.000Z');

  it('보존 기간이 지난 것만 지운다', async () => {
    await pruneOldNotifications(NOW);

    const where = db.notification.deleteMany.mock.calls.at(-1)![0].where;
    expect(where.createdAt.lt).toEqual(notificationCutoff(NOW));
  });

  it('읽은 것만 지운다 — 안 읽은 것은 아직 못 본 소식이다', async () => {
    /*
     * 90일 넘게 안 읽었다면 볼 일이 없을 가능성이 크지만, 그 판단을 우리가 대신
     * 내리면 "왜 알림이 사라졌냐" 는 말에 답할 수가 없다.
     */
    await pruneOldNotifications(NOW);

    expect(db.notification.deleteMany.mock.calls.at(-1)![0].where.readAt).toEqual({ not: null });
  });

  it('지운 수를 돌려준다 — 감사 로그가 그 값을 남긴다', async () => {
    db.notification.deleteMany.mockResolvedValue({ count: 42 });
    expect(await pruneOldNotifications(NOW)).toBe(42);
  });
});

describe('범위를 넘은 쪽', () => {
  /*
   * 주소는 손으로 고칠 수 있고, 즐겨찾기에 담아 둔 쪽은 알림이 지워지면서 사라진다.
   * 그때 빈 화면을 주면 "왜 아무것도 없지" 로 끝난다 — 쪽 번호는 마지막 쪽을
   * 가리켜 그리는데 목록만 비어 있으니 더 그렇다.
   */
  it('마지막 쪽을 대신 읽는다', async () => {
    db.notification.count.mockResolvedValue(71);
    db.notification.findMany
      .mockResolvedValueOnce([]) // 999쪽 — 아무것도 없다
      .mockResolvedValueOnce([row()]); // 마지막 쪽

    const page = await getMyNotifications('u-1', 'customer', 999);

    expect(page.rows).toHaveLength(1);
    // 71건 / 30 = 3쪽. 셋째 쪽의 첫 줄은 60번째다.
    expect(db.notification.findMany.mock.calls.at(-1)![0].skip).toBe(60);
  });

  it('멀쩡한 쪽은 한 번만 읽는다 — 세고 나서 읽으면 왕복이 늘어난다', async () => {
    db.notification.count.mockResolvedValue(71);
    db.notification.findMany.mockResolvedValue([row()]);

    await getMyNotifications('u-1', 'customer', 2);

    expect(db.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it('진짜로 빈 알림함은 다시 읽지 않는다', async () => {
    // 없는 것을 한 번 더 찾아봐야 없다
    db.notification.count.mockResolvedValue(0);
    db.notification.findMany.mockResolvedValue([]);

    const page = await getMyNotifications('u-1', 'customer', 5);

    expect(page.rows).toEqual([]);
    expect(db.notification.findMany).toHaveBeenCalledTimes(1);
  });
});
