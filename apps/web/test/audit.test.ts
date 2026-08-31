import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const create = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
vi.mock('@shop/db', () => ({ prisma: { adminAuditLog: { create } } }));

const { recordAudit, redactForAudit } = await import('~/lib/audit');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };

beforeEach(() => create.mockClear());

describe('민감 필드 제거', () => {
  it('비밀번호·토큰·정산계좌를 남기지 않는다', () => {
    const out = redactForAudit({
      email: 'a@b.test',
      passwordHash: '$2b$10$abcdef',
      accessToken: 'tok_live_xxx',
      settlementAccount: '110-123-456789',
    }) as Record<string, string>;
    expect(out['email']).toBe('a@b.test');
    expect(out['passwordHash']).toBe('[감사 로그에서 제외]');
    expect(out['accessToken']).toBe('[감사 로그에서 제외]');
    expect(out['settlementAccount']).toBe('[감사 로그에서 제외]');
  });

  it('중첩된 객체 안쪽도 훑는다', () => {
    const out = redactForAudit({ user: { profile: { secret: 'zzz', name: '장병윤' } } });
    expect(JSON.stringify(out)).not.toContain('zzz');
    expect(JSON.stringify(out)).toContain('장병윤');
  });

  it('배열 원소도 훑는다', () => {
    const out = redactForAudit([{ token: 'a' }, { token: 'b' }]);
    expect(JSON.stringify(out)).not.toContain('"a"');
  });

  it('원시값과 null 은 그대로 둔다', () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(42)).toBe(42);
    expect(redactForAudit('평문')).toBe('평문');
  });
});

describe('recordAudit', () => {
  it('행위자의 역할과 소속을 그 시점 값으로 박는다', async () => {
    await recordAudit({
      actor: merchant, action: 'product.update', targetType: 'product', targetId: 'p-1',
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      actorId: 'u-m', actorRole: 'MERCHANT', merchantId: 'm-1',
      action: 'product.update', targetType: 'product', targetId: 'p-1',
    });
  });

  it('before/after 를 넘기지 않으면 키 자체를 만들지 않는다', async () => {
    await recordAudit({ actor: admin, action: 'order.cancel', targetType: 'order', targetId: 'o-1' });
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect('before' in data).toBe(false);
    expect('after' in data).toBe(false);
  });

  it('before/after 에도 민감 필드 제거를 적용한다', async () => {
    await recordAudit({
      actor: admin, action: 'merchant.update', targetType: 'merchant', targetId: 'm-1',
      before: { settlementAccount: '110-999' },
      after: { settlementAccount: '110-111' },
    });
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(JSON.stringify(data)).not.toContain('110-999');
    expect(JSON.stringify(data)).not.toContain('110-111');
  });

  it('IP 를 해시해서 남긴다', async () => {
    await recordAudit({
      actor: admin, action: 'order.refund', targetType: 'order', targetId: 'o-1',
      request: new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7' } }),
    });
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data['ipHash']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('기록에 실패해도 본 동작을 되돌리지 않는다 — 던지지 않는다', async () => {
    create.mockRejectedValueOnce(new Error('DB 다운'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      recordAudit({ actor: admin, action: 'order.refund', targetType: 'order', targetId: 'o-1' }),
    ).resolves.toBeUndefined();
    // 다만 조용히 넘기지도 않는다
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
