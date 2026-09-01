import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({ adminAuditLog: { findMany: vi.fn<(...a: any[]) => any>() } }));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAuditLogs } = await import('~/lib/queries/audit-log');

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const row = (id: string) => ({
  id, actorRole: 'ADMIN', action: 'product.update', targetType: 'product', targetId: 'p-1',
  before: { listPrice: 1000 }, after: { listPrice: 900 },
  createdAt: new Date('2026-08-31T00:00:00Z'),
  actor: { name: '관리자', email: 'admin@plain.test' },
});

/** 첫 호출은 목록, 그다음 두 번은 필터 선택지 */
function mockPage(rows: ReturnType<typeof row>[]) {
  db.adminAuditLog.findMany
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ action: 'product.update' }])
    .mockResolvedValueOnce([{ targetType: 'product' }]);
}

beforeEach(() => vi.clearAllMocks());

describe('권한', () => {
  it('가맹점은 볼 수 없다 — 운영진을 감시하는 도구다', async () => {
    await expect(getAuditLogs(merchant)).rejects.toThrow();
    expect(db.adminAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('고객은 볼 수 없다', async () => {
    await expect(getAuditLogs(customer)).rejects.toThrow();
  });

  it('관리자는 볼 수 있다', async () => {
    mockPage([row('a-1')]);
    await expect(getAuditLogs(admin)).resolves.toBeDefined();
  });

  it('슈퍼관리자도 볼 수 있다', async () => {
    mockPage([row('a-1')]);
    await expect(getAuditLogs(superAdmin)).resolves.toBeDefined();
  });
});

describe('커서 페이지네이션', () => {
  it('한 쪽 더 읽어 다음 쪽 존재를 판단한다', async () => {
    mockPage(Array.from({ length: 4 }, (_, i) => row(`a-${i}`)));
    const page = await getAuditLogs(admin, { take: 3 });

    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].take).toBe(4);
    // 한 쪽 더 읽었지만 돌려주는 것은 요청한 만큼만
    expect(page.rows).toHaveLength(3);
    expect(page.nextCursor).toBe('a-2');
  });

  it('마지막 쪽이면 커서가 없다', async () => {
    mockPage([row('a-0'), row('a-1')]);
    const page = await getAuditLogs(admin, { take: 3 });
    expect(page.rows).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it('커서를 받으면 그 행 다음부터 읽는다', async () => {
    mockPage([row('a-9')]);
    await getAuditLogs(admin, { cursor: 'a-5' });
    const args = db.adminAuditLog.findMany.mock.calls[0]?.[0];
    expect(args.cursor).toEqual({ id: 'a-5' });
    // skip:1 이 없으면 커서 행이 다음 쪽 첫 줄로 다시 나온다
    expect(args.skip).toBe(1);
  });

  it('첫 쪽에는 커서를 넘기지 않는다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin);
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].cursor).toBeUndefined();
  });

  it('정렬은 시각과 id 두 축이다 — 같은 밀리초에서 순서가 흔들리면 커서가 깨진다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin);
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      { createdAt: 'desc' }, { id: 'desc' },
    ]);
  });

  it('take 는 상한을 넘지 못한다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin, { take: 5000 });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].take).toBe(51);
  });
});

describe('필터', () => {
  it('빈 필터는 where 에 들어가지 않는다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin, { action: undefined, targetType: undefined });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].where).toEqual({});
  });

  it('동작과 대상으로 좁힌다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin, { action: 'product.update', targetType: 'product' });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].where).toEqual({
      action: 'product.update', targetType: 'product',
    });
  });

  it('선택지는 쌓인 값에서 뽑는다', async () => {
    mockPage([row('a-0')]);
    const page = await getAuditLogs(admin);
    expect(page.filters.actions).toEqual(['product.update']);
    expect(page.filters.targetTypes).toEqual(['product']);
  });
});

describe('표시값', () => {
  it('역할은 그 시점 스냅샷을 그대로 쓴다', async () => {
    mockPage([{ ...row('a-0'), actorRole: 'SUPER_ADMIN' }]);
    const page = await getAuditLogs(admin);
    // 지금 이 계정의 역할이 무엇이든 기록된 값이 나와야 한다
    expect(page.rows[0]?.actorRole).toBe('SUPER_ADMIN');
  });

  it('변경 전후를 그대로 넘긴다', async () => {
    mockPage([row('a-0')]);
    const page = await getAuditLogs(admin);
    expect(page.rows[0]?.before).toEqual({ listPrice: 1000 });
    expect(page.rows[0]?.after).toEqual({ listPrice: 900 });
  });
});
