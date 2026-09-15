import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/** 이용 정지 창구 — 정지·해제가 끝난 뒤 손님에게 알리고, 막히면 알리지 않는다 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
vi.mock('~/lib/audit', () => ({ recordAudit: vi.fn() }));
const suspendUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/manage-access')>()),
  suspendUser,
}));
const notifySuspension = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/account/notify-account', () => ({ notifySuspension }));

const { AccessError } = await import('~/lib/admin/manage-access');
const { PATCH } = await import('~/app/api/admin/users/[id]/suspension/route');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const call = (body: unknown) =>
  PATCH(new Request('http://localhost/api/admin/users/u-1/suspension', { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: 'u-1' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  suspendUser.mockResolvedValue({ before: {}, after: {} });
});

describe('이용 정지 창구의 알림', () => {
  it('정지하면 사유와 함께, 풀면 사유 없이 알린다', async () => {
    await call({ action: 'SUSPEND', reason: '결제 도용 의심' });
    expect(notifySuspension).toHaveBeenCalledWith({ userId: 'u-1', action: 'SUSPEND', reason: '결제 도용 의심' });
    notifySuspension.mockClear();
    await call({ action: 'RESTORE' });
    expect(notifySuspension).toHaveBeenCalledWith({ userId: 'u-1', action: 'RESTORE', reason: null });
  });

  it('정지가 막히면 알리지 않는다', async () => {
    suspendUser.mockRejectedValue(new AccessError('ALREADY_SUSPENDED'));
    expect((await call({ action: 'SUSPEND', reason: 'x' })).status).toBe(409);
    expect(notifySuspension).not.toHaveBeenCalled();
  });
});
