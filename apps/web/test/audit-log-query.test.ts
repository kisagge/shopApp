import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  adminAuditLog: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAuditLogs, auditLogWhere, exportAuditLogs, AUDIT_EXPORT_MAX_ROWS, SYSTEM_ACTOR } = await import('~/lib/queries/audit-log');

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

/** 첫 호출은 목록, 그다음 세 번은 필터 선택지(동작·대상·행위자) */
function mockPage(
  rows: ReturnType<typeof row>[],
  actors: { actorId: string | null; actor: { name: string; email: string } | null }[] = [],
) {
  db.adminAuditLog.findMany
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce([{ action: 'product.update' }])
    .mockResolvedValueOnce([{ targetType: 'product' }])
    .mockResolvedValueOnce(actors);
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

describe('쪽 번호 페이지네이션', () => {
  it('한 쪽만큼만 읽는다 — 다음 쪽이 있는지는 전체 수가 말한다', async () => {
    mockPage([row('a-0'), row('a-1'), row('a-2')]);
    const page = await getAuditLogs(admin, { take: 3 });

    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].take).toBe(3);
    expect(page.rows).toHaveLength(3);
  });

  it('쪽 번호만큼 건너뛴다', async () => {
    mockPage([row('a-9')]);
    await getAuditLogs(admin, { page: 3, take: 25 });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].skip).toBe(50);
  });

  it('첫 쪽은 건너뛰지 않는다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin);
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].skip).toBe(0);
  });

  it('정렬은 시각과 id 두 축이다 — 같은 밀리초에서 순서가 흔들리면 쪽을 넘길 때 행이 겹친다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin);
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].orderBy).toEqual([
      { createdAt: 'desc' }, { id: 'desc' },
    ]);
  });

  it('take 는 상한을 넘지 못한다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin, { take: 5000 });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].take).toBe(50);
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

describe('기간·행위자 조건', () => {
  it('행위자는 사용자 id 로, "자동 실행" 은 행위자가 없는 기록으로 좁힌다', () => {
    expect(auditLogWhere({ actor: 'u-a' })).toEqual({ actorId: 'u-a' });
    expect(auditLogWhere({ actor: SYSTEM_ACTOR })).toEqual({ actorId: null });
  });

  it('기간은 KST 로 자르고 끝날을 포함한다 — 9월 4일까지면 9월 5일 00:00 KST 앞까지', () => {
    expect(auditLogWhere({ from: '2026-09-01', to: '2026-09-04' })).toEqual({
      createdAt: {
        gte: new Date('2026-08-31T15:00:00Z'),
        lt: new Date('2026-09-04T15:00:00Z'),
      },
    });
  });

  it('한쪽 끝만 있어도 된다', () => {
    expect(auditLogWhere({ from: '2026-09-01' })).toEqual({ createdAt: { gte: new Date('2026-08-31T15:00:00Z') } });
  });

  it('시작이 끝보다 뒤거나 날짜가 아니면 조용히 넘기지 않고 던진다', () => {
    expect(() => auditLogWhere({ from: '2026-09-05', to: '2026-09-01' })).toThrow('시작일이 종료일보다 뒤입니다');
    expect(() => auditLogWhere({ from: '2026-13-40' })).toThrow();
  });

  it('목록이 같은 조건을 쓴다', async () => {
    mockPage([row('a-0')]);
    await getAuditLogs(admin, { actor: 'u-a', from: '2026-09-01', action: 'user.suspend' });
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].where).toEqual(
      auditLogWhere({ actor: 'u-a', from: '2026-09-01', action: 'user.suspend' }),
    );
  });

  it('행위자 선택지는 이름·이메일로 적고, 배치는 "자동 실행" 한 칸으로 맨 뒤에', async () => {
    mockPage([row('a-0')], [
      { actorId: null, actor: null },
      { actorId: 'u-b', actor: { name: '슈퍼관리자', email: 'super@plain.test' } },
      { actorId: 'u-a', actor: { name: '운영 관리자', email: 'admin@plain.test' } },
    ]);
    const page = await getAuditLogs(admin);
    expect(page.filters.actors).toEqual([
      { value: 'u-b', label: '슈퍼관리자 · super@plain.test' },
      { value: 'u-a', label: '운영 관리자 · admin@plain.test' },
      { value: SYSTEM_ACTOR, label: '자동 실행' },
    ]);
  });
});

describe('내려받기', () => {
  it('가맹점은 받을 수 없다', async () => {
    await expect(exportAuditLogs(merchant, {})).rejects.toThrow();
    expect(db.adminAuditLog.count).not.toHaveBeenCalled();
  });

  it('목록과 같은 조건·순서로 전부 읽는다 — 쪽 나눔 없이', async () => {
    db.adminAuditLog.count.mockResolvedValue(2);
    db.adminAuditLog.findMany.mockResolvedValue([row('a-1'), row('a-0')]);
    const rows = await exportAuditLogs(admin, { actor: 'u-a', to: '2026-09-04' });

    const args = db.adminAuditLog.findMany.mock.calls[0]?.[0];
    expect(args.where).toEqual(auditLogWhere({ actor: 'u-a', to: '2026-09-04' }));
    expect(db.adminAuditLog.count.mock.calls[0]?.[0].where).toEqual(args.where);
    expect(args.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(args.take).toBeUndefined();
    expect(rows.map((r) => r.id)).toEqual(['a-1', 'a-0']);
  });

  it('한도를 넘으면 잘라 주지 않고 거절한다 — 앞 일부만 담긴 파일은 전부로 읽힌다', async () => {
    db.adminAuditLog.count.mockResolvedValue(AUDIT_EXPORT_MAX_ROWS + 1);
    await expect(exportAuditLogs(admin, {})).rejects.toThrow(/좁혀 주세요/);
    expect(db.adminAuditLog.findMany).not.toHaveBeenCalled();
  });
});
