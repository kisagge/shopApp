import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCsv, type Actor } from '@shop/core';

/**
 * 감사 로그 내려받기 창구와 이름표.
 *
 * 조건 만들기와 한도는 audit-log-query 가 본다. 여기서 보는 것은 파일의 **모양과 선**이다 — 이름표와 코드가 함께
 * 실리는지, 사람이 적은 값(정지 사유 등)이 엑셀에서 수식으로 돌지 않는지, 받은 것도 기록에 남는지.
 */

const db = vi.hoisted(() => ({
  adminAuditLog: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));

const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { POST } = await import('~/app/api/admin/audit/export/route');
const { ACTION_LABEL } = await import('~/lib/admin/audit-labels');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const LOG = {
  id: 'a-1', actorRole: 'ADMIN', action: 'user.suspend', targetType: 'user', targetId: 'u-9',
  before: { suspendedAt: null, suspendedReason: null },
  after: { suspendedAt: '2026-09-14T01:00:00.000Z', suspendedReason: '=HYPERLINK("http://evil")' },
  createdAt: new Date('2026-09-14T01:00:00Z'), // KST 10:00
  actorLabel: null,
  actor: { name: '운영 관리자', email: 'admin@plain.test' },
};
const BATCH = { ...LOG, id: 'a-0', actorRole: 'SUPER_ADMIN', action: 'points.expire', actor: null, actorLabel: 'system:cron', before: null, after: null };

const call = (query = '') => POST(new Request(`http://localhost/api/admin/audit/export${query}`, { method: 'POST' }));

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
  db.adminAuditLog.count.mockResolvedValue(2);
  db.adminAuditLog.findMany.mockResolvedValue([LOG, BATCH]);
});

describe('파일', () => {
  it('이름표와 코드를 함께, 시각은 KST, 배치는 이메일 없이', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="audit-\d{12}\.csv"/);

    const [header, first, second] = parseCsv(await response.text());
    expect(header).toEqual(['시각', '행위자', '이메일', '당시 역할', '동작', '동작 코드', '대상', '대상 코드', '대상 ID', '변경 전', '변경 후']);
    expect(first!.slice(0, 9)).toEqual(['2026-09-14 10:00:00', '운영 관리자', 'admin@plain.test', '관리자', '이용 정지', 'user.suspend', '회원', 'user', 'u-9']);
    expect(second!.slice(1, 3)).toEqual(['system:cron', '']);
    expect(second!.slice(9)).toEqual(['', '']);
  });

  it('변경 전후는 줄바꿈 없는 JSON 한 칸 — 사람이 적은 값이 수식으로 돌지 않는다', async () => {
    const [, first] = parseCsv(await (await call()).text());
    expect(first![9]).toBe('{"suspendedAt":null,"suspendedReason":null}');
    expect(first![10]).not.toContain('\n');
    // JSON 은 { 로 시작해 수식 머리가 아니다. 값 안의 = 는 칸의 첫 글자가 아니라 실행되지 않는다
    expect(first![10]!.startsWith('{')).toBe(true);
  });

  it('주소의 조건을 그대로 쓰고, 몇 건을 어떤 조건으로 받았는지 감사 로그에 남긴다', async () => {
    await call('?actor=u-a&from=2026-09-01&to=2026-09-14&action=user.suspend');
    expect(db.adminAuditLog.findMany.mock.calls[0]?.[0].where).toMatchObject({ actorId: 'u-a', action: 'user.suspend' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'audit.export',
      targetType: 'audit',
      after: { rows: 2, action: 'user.suspend', targetType: undefined, actor: 'u-a', from: '2026-09-01', to: '2026-09-14' },
    }));
  });
});

describe('막는 것', () => {
  it('로그인 안 했으면 401, 가맹점이면 403 — 둘 다 기록하지 않는다', async () => {
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    getActor.mockResolvedValue(merchant);
    expect((await call()).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('요청 제한에 걸리면 읽지 않는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(enforceRateLimit.mock.calls[0]?.[0]).toBe('auditExport');
    expect(db.adminAuditLog.findMany).not.toHaveBeenCalled();
  });

  it('한도를 넘으면 413, 기간이 거꾸로면 400 과 그 이유', async () => {
    db.adminAuditLog.count.mockResolvedValue(10_000);
    expect((await call()).status).toBe(413);
    const bad = await call('?from=2026-09-10&to=2026-09-01');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { message: string }).message).toContain('시작일이 종료일보다 뒤입니다');
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('이름표', () => {
  /**
   * 기록하는 동작마다 이름표가 있다. 없으면 화면과 파일에 'order.releaseHold' 같은 코드가 그대로 나가는데, 보는 사람이
   * 운영진이라 버그로 드러나지 않고 계속 남는다 — 실제로 열여덟 개가 그랬다.
   *
   * 폴더를 읽어 `action:` 옆의 문자열을 모은다. 템플릿으로 만드는 두 곳은 가능한 값을 여기 적는다.
   */
  const SRC = join(process.cwd(), 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);

  it('기록하는 동작 전부에 이름표가 있다', () => {
    const recorded = new Set<string>();
    for (const file of files(SRC)) {
      if (file.endsWith('audit-labels.ts')) continue;
      const text = readFileSync(file, 'utf8');
      if (!text.includes('recordAudit') && !text.includes('adminAuditLog.create')) continue;
      for (const line of text.split('\n').filter((l) => /\baction:/.test(l))) {
        for (const [, name] of line.matchAll(/'([a-z]+(?:\.[a-zA-Z]+)+)'/g)) recorded.add(name!);
      }
    }
    // 템플릿으로 만드는 동작 — merchants/[id]/status, orders/[orderNo]/status
    for (const s of ['approved', 'suspended', 'terminated']) recorded.add(`merchant.${s}`);
    for (const s of ['preparing', 'shipped', 'delivered', 'cancelled', 'refunded']) recorded.add(`order.status.${s}`);

    expect(recorded.size).toBeGreaterThan(40);
    expect([...recorded].filter((a) => !(a in ACTION_LABEL)).sort()).toEqual([]);
  });
});
