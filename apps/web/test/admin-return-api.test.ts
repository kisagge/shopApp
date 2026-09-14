import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영 반품 창구 — 승인·반려에 "회수 확인 · 환불" 이 더해졌다.
 *
 * 돈이 나가는 동작이라 감사 로그와 카탈로그 캐시(돌아온 재고)를 함께 본다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const revalidateCatalog = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateCatalog }));

const completeReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/complete-return', () => ({ completeReturn }));
const resolveReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/return-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/orders/return-request')>()),
  resolveReturn,
}));

const { ReturnError } = await import('~/lib/orders/return-request');
const { POST } = await import('~/app/api/admin/orders/[orderNo]/return/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const call = (body: unknown) =>
  POST(
    new Request('http://localhost/api/admin/orders/20260914-0000002/return', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orderNo: '20260914-0000002' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  completeReturn.mockResolvedValue({ orderNo: '20260914-0000002', kind: 'partial', refunded: 24_000, pointsReturned: 0, shippingDeducted: 3_000, orderStatus: 'DELIVERED' });
  resolveReturn.mockResolvedValue({ orderNo: '20260914-0000002', status: 'APPROVED', orderStatus: 'RETURN_REQUESTED' });
});

describe('운영 반품 창구', () => {
  it('회수 확인이면 돌려주고, 누가 얼마를 돌려줬는지 남기고, 카탈로그를 턴다', async () => {
    const response = await call({ action: 'COMPLETE' });
    expect(response.status).toBe(200);
    expect(completeReturn).toHaveBeenCalledWith('20260914-0000002', admin);
    expect(resolveReturn).not.toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'order.completeReturn', after: { refunded: 24_000 } });
    expect(revalidateCatalog).toHaveBeenCalled();
  });

  it('승인은 돈을 움직이지 않는다 — 회수 확인을 부르지 않는다', async () => {
    await call({ action: 'APPROVE' });
    expect(resolveReturn).toHaveBeenCalled();
    expect(completeReturn).not.toHaveBeenCalled();
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('승인 안 된 신청이면 거절 사유를 그대로 전하고 기록하지 않는다', async () => {
    completeReturn.mockRejectedValue(new ReturnError('NOT_APPROVED', '승인한 신청만 회수 확인할 수 있습니다.'));
    const response = await call({ action: 'COMPLETE' });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NOT_APPROVED' });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
