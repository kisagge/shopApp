import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const db = vi.hoisted(() => ({
  restockNotification: {
    findMany: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { notifyRestocked } = await import('~/lib/restock/notify');
const { setMailerForTest } = await import('@shop/mail');

/**
 * 재입고 알림이 **기본 경로로** 메일까지 가는지 본다.
 *
 * 기존 restock 테스트는 notifier 를 테스트용으로 갈아 끼우고 부른다 —
 * 그러면 구독·중복 방지 규칙은 검증되지만 정작 기본값이 무엇을 하는지는
 * 아무도 보지 않는다. 여기서는 갈아 끼우지 않고 발송기만 세운다.
 */

const sent: { to: string; subject: string; html: string }[] = [];

const pending = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  userId: 'u-1',
  variantId: 'v-1',
  user: { email: 'buyer@plain.test' },
  variant: { label: '차콜 / M', product: { name: '오버사이즈 울 블렌드 코트', slug: 'coat' } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  sent.length = 0;
  db.restockNotification.updateMany.mockResolvedValue({ count: 1 });
  setMailerForTest({
    name: 'test',
    send: (m) => { sent.push({ to: m.to, subject: m.subject, html: m.html }); return Promise.resolve(); },
  });
});
afterEach(() => setMailerForTest(null));

describe('재입고 알림 메일', () => {
  it('대기자에게 상품 링크가 든 메일이 간다', async () => {
    db.restockNotification.findMany.mockResolvedValue([pending()]);

    const result = await notifyRestocked(['v-1']);

    expect(result.notified).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('buyer@plain.test');
    expect(sent[0]?.subject).toContain('오버사이즈 울 블렌드 코트');
    // 메일함에는 기준이 될 주소가 없다 — 상대 경로면 링크가 죽는다
    expect(sent[0]?.html).toMatch(/href="https?:\/\/[^"]+\/product\/coat"/);
  });

  it('한 통이 실패해도 나머지는 간다', async () => {
    db.restockNotification.findMany.mockResolvedValue([
      pending({ id: 'n-1', user: { email: 'bounces@plain.test' } }),
      pending({ id: 'n-2', user: { email: 'ok@plain.test' } }),
    ]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setMailerForTest({
      name: 'flaky',
      send: (m) => {
        if (m.to === 'bounces@plain.test') return Promise.reject(new Error('반송'));
        sent.push({ to: m.to, subject: m.subject, html: m.html });
        return Promise.resolve();
      },
    });

    const result = await notifyRestocked(['v-1']);

    expect(sent.map((s) => s.to)).toEqual(['ok@plain.test']);
    // 발송 표시는 이미 끝나 있어 되돌릴 수 없다. 결과는 그대로 알린다.
    expect(result.notified).toBe(2);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('메일이 전부 실패해도 재고 수정까지 되돌리지 않는다', async () => {
    db.restockNotification.findMany.mockResolvedValue([pending()]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setMailerForTest({ name: 'dead', send: () => Promise.reject(new Error('발송 불가')) });

    // 던지면 이 함수를 부르는 재고 수정이 실패한 것처럼 보인다
    await expect(notifyRestocked(['v-1'])).resolves.toMatchObject({ notified: 1 });
    error.mockRestore();
  });

  it('대기자가 없으면 아무것도 보내지 않는다', async () => {
    db.restockNotification.findMany.mockResolvedValue([]);

    await notifyRestocked(['v-1']);

    expect(sent).toHaveLength(0);
    expect(db.restockNotification.updateMany).not.toHaveBeenCalled();
  });
});
