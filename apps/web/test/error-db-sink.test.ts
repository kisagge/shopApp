import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ErrorReport } from '@shop/core';

/**
 * 오류를 지문별로 묶어 쌓는다.
 *
 * 한 건마다 남기면 표가 금방 커지고, 정작 보고 싶은 것("몇 번 났는가")은 매번 세어야 한다.
 */

const db = vi.hoisted(() => ({
  errorGroup: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { dbSink } = await import('~/lib/errors/db-sink');

const report = (over: Partial<ErrorReport> = {}): ErrorReport => ({
  fingerprint: 'TypeError|/cart|Cannot read properties of undefined',
  severity: 'fatal',
  name: 'TypeError',
  message: "Cannot read properties of undefined (reading 'id')",
  stack: 'TypeError: ...\n  at Cart',
  digest: null,
  routePath: '/cart',
  routeType: 'render',
  method: 'GET',
  path: '/cart',
  occurredAt: new Date('2026-09-16T10:00:00Z'),
  ...over,
});

const sink = dbSink('browser');

beforeEach(() => {
  vi.clearAllMocks();
  db.errorGroup.findUnique.mockResolvedValue(null);
});

describe('오류 쌓기', () => {
  it('처음 보는 지문이면 행을 만든다', async () => {
    await sink.report(report(), { headers: {} });

    expect(db.errorGroup.create.mock.calls[0]![0].data).toMatchObject({
      fingerprint: 'TypeError|/cart|Cannot read properties of undefined',
      source: 'browser',
      severity: 'fatal',
      // 횟수는 적지 않는다 — 처음이면 1 이고 그건 DB 의 기본값이다
      firstSeenAt: new Date('2026-09-16T10:00:00Z'),
      lastSeenAt: new Date('2026-09-16T10:00:00Z'),
    });
    expect(db.errorGroup.update).not.toHaveBeenCalled();
  });

  it('이미 있으면 횟수를 올리고 마지막 시각을 갈아 끼운다', async () => {
    db.errorGroup.findUnique.mockResolvedValue({ resolvedAt: null });
    await sink.report(report(), { headers: {} });

    const data = db.errorGroup.update.mock.calls[0]![0].data;
    expect(data.count).toEqual({ increment: 1 });
    expect(data.lastSeenAt).toEqual(new Date('2026-09-16T10:00:00Z'));
    expect(db.errorGroup.create).not.toHaveBeenCalled();
  });

  it('메시지와 스택은 마지막 것으로 갈아 끼운다 — 고칠 때 보는 것은 최근 것이다', async () => {
    db.errorGroup.findUnique.mockResolvedValue({ resolvedAt: null });
    await sink.report(report({ message: '다른 말' }), { headers: {} });

    expect(db.errorGroup.update.mock.calls[0]![0].data.message).toBe('다른 말');
  });

  it('처리한 뒤에 또 나면 다시 연다', async () => {
    db.errorGroup.findUnique.mockResolvedValue({ resolvedAt: new Date('2026-09-16T09:00:00Z') });
    await sink.report(report(), { headers: {} });

    const data = db.errorGroup.update.mock.calls[0]![0].data;
    expect(data.resolvedAt).toBeNull();
    expect(data.resolvedById).toBeNull();
  });

  it('처리보다 이른 보고로는 열지 않는다 — 늦게 도착한 것이다', async () => {
    db.errorGroup.findUnique.mockResolvedValue({ resolvedAt: new Date('2026-09-16T11:00:00Z') });
    await sink.report(report(), { headers: {} });

    expect(db.errorGroup.update.mock.calls[0]![0].data).not.toHaveProperty('resolvedAt');
  });

  it('긴 스택은 잘라 둔다 — 브라우저가 보낸 것을 그대로 믿지 않는다', async () => {
    await sink.report(report({ stack: 'x'.repeat(9000) }), { headers: {} });

    const stack = db.errorGroup.create.mock.calls[0]![0].data.stack as string;
    expect(stack.length).toBeLessThan(9000);
    expect(stack).toContain('잘림');
  });
});
