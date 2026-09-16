import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 약관·방침 저장 창구.
 *
 * **저장은 덮어쓰기가 아니라 갈아 끼우기다.** 바뀌기 전 내용이 지난 방침으로 남아야, 동의 기록(시각 하나)이 그날 무엇에
 * 대한 동의였는지 답할 수 있다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const revalidatePolicies = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({
  revalidatePolicies,
  TAG: { policies: 'policies' },
  TTL: { support: 600 },
  cachedRead: (fn: any) => fn,
}));

const db = vi.hoisted(() => ({
  policy: { findUnique: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>() },
  policyRevision: { create: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: { JsonNull: 'JsonNull' },
}));

const { PUT } = await import('~/app/api/admin/policies/[kind]/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const body = {
  title: 'PLAIN 이용약관',
  effectiveOn: '2026-03-01',
  bodyRich: doc('제1조 (목적) 이 약관은 …'),
};

const call = (kind: string, input: unknown = body) =>
  PUT(
    new Request(`http://localhost/api/admin/policies/${kind}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ kind }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  db.policy.findUnique.mockResolvedValue(null);
  db.policy.upsert.mockImplementation(async ({ create, update }: any) => ({
    kind: 'TERMS',
    title: (update ?? create).title,
    body: (update ?? create).body,
    bodyRich: (update ?? create).bodyRich,
    effectiveAt: (update ?? create).effectiveAt,
    updatedAt: new Date('2026-02-20T00:00:00Z'),
  }));
  db.$transaction.mockImplementation(async (fn: any) => fn(db));
});

describe('PUT /api/admin/policies/[kind]', () => {
  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call('TERMS')).status).toBe(401);
  });

  it('아는 종류만 받는다 — 주소 조각을 그대로 믿지 않는다', async () => {
    const response = await call('COOKIES');
    expect(response.status).toBe(404);
    expect(db.policy.upsert).not.toHaveBeenCalled();
  });

  it('가맹점은 가게 전체의 약속을 고치지 못한다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('PRIVACY')).status).toBe(403);
    expect(db.policy.upsert).not.toHaveBeenCalled();
  });

  it('바뀌기 전 내용을 지난 방침으로 남기고 새 내용을 올린다', async () => {
    db.policy.findUnique.mockResolvedValue({
      kind: 'TERMS',
      title: '옛 약관',
      body: '옛 본문',
      bodyRich: doc('옛 본문'),
      effectiveAt: new Date('2026-01-01T00:00:00+09:00'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    expect((await call('TERMS')).status).toBe(200);
    expect(db.policyRevision.create.mock.calls[0]![0].data).toMatchObject({ kind: 'TERMS', title: '옛 약관' });
    expect(db.policy.upsert.mock.calls[0]![0].update).toMatchObject({ title: 'PLAIN 이용약관' });
  });

  it('처음 쓰는 문서면 남길 지난 방침이 없다', async () => {
    expect((await call('PRIVACY')).status).toBe(200);
    expect(db.policyRevision.create).not.toHaveBeenCalled();
    expect(db.policy.upsert).toHaveBeenCalled();
  });

  it('시행일을 한국 시각 0시로 읽는다 — UTC 로 읽으면 예고한 날보다 하루 일찍 바뀐다', async () => {
    await call('TERMS');
    const saved = db.policy.upsert.mock.calls[0]![0].create.effectiveAt as Date;
    expect(saved.toISOString()).toBe('2026-02-28T15:00:00.000Z');
  });

  it('본문에서 평문을 뽑아 함께 저장한다 — 목록과 meta 가 읽는 칸이다', async () => {
    await call('TERMS');
    expect(db.policy.upsert.mock.calls[0]![0].create.body).toContain('제1조');
  });

  it('빈 본문과 말이 안 되는 시행일은 칸 이름과 함께 거절한다', async () => {
    const response = await call('TERMS', {
      ...body,
      effectiveOn: '2026/03/01',
      bodyRich: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
    });
    expect(response.status).toBe(400);
    const failed = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(failed.fields).sort()).toEqual(['bodyRich', 'effectiveOn']);
    expect(db.policy.upsert).not.toHaveBeenCalled();
  });

  it('바꾼 사실을 감사 로그에 남기고 손님 화면 캐시를 턴다', async () => {
    await call('TERMS');
    expect(revalidatePolicies).toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      action: 'policy.update',
      targetType: 'policy',
      targetId: 'TERMS',
    });
  });
});
