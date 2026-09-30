import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영진·가맹점의 배송지 수정 창구.
 *
 * **남의 주소를 대신 바꾸는 일이다.** 물건이 어디로 가는지를 정하는 값이라, 누가 언제 무엇을 무엇으로
 * 바꿨는지가 남아야 한다. 가맹점은 자기 상품이 담긴 주문만 연다 — 송장 등록과 같은 범위다.
 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getActor = session.getActor;

const audit = vi.hoisted(() => ({ recordAudit: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/audit', () => audit);

const lib = vi.hoisted(() => ({ updateOrderAddress: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/orders/update-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/orders/update-address')>()),
  ...lib,
}));

const { AddressEditError } = await import('~/lib/orders/update-address');
const { PATCH } = await import('~/app/api/admin/orders/[orderNo]/address/route');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };

const body = {
  recipient: '장부장',
  phone: '010-1234-5678',
  postalCode: '04766',
  address1: '서울 성동구 왕십리로 1',
  address2: '101동 1001호',
};

const before = {
  recipient: '장보영', phone: '010-0000-0000', postalCode: '04766',
  address1: '서울 성동구 왕십리로 1', address2: '3층', memo: null, isRemoteArea: false,
};
const after = { ...before, recipient: '장부장', address2: '101동 1001호' };

const call = (b: unknown = body) =>
  PATCH(
    new Request('http://localhost/api/admin/orders/20260901-0000001/address', {
      method: 'PATCH',
      body: typeof b === 'string' ? b : JSON.stringify(b),
    }),
    { params: Promise.resolve({ orderNo: '20260901-0000001' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  lib.updateOrderAddress.mockResolvedValue({
    orderNo: '20260901-0000001', shippingDelta: 0, shippingFee: 3_000, payable: 103_000,
    isRemoteArea: false, before, after,
  });
});

describe('PATCH /api/admin/orders/[orderNo]/address', () => {
  it('운영진은 손님을 묶지 않고 고친다 — 누구의 주문이든 연다', async () => {
    expect((await call()).status).toBe(200);
    // 처리 이력에 찍히는 사람이 함께 간다 — 남의 주소를 대신 바꾸는 일이다
    expect(lib.updateOrderAddress).toHaveBeenCalledWith(
      '20260901-0000001',
      expect.objectContaining({ recipient: '장부장' }),
      { actorId: 'u-admin' },
    );
  });

  /** 송장 등록과 같은 범위다 — 남의 가맹점 주문 주소를 바꿀 수 없다 */
  it('가맹점은 자기 상품이 담긴 주문만 연다', async () => {
    getActor.mockResolvedValue(merchant);

    expect((await call()).status).toBe(200);
    expect(lib.updateOrderAddress.mock.calls[0]![2]).toEqual({ actorId: 'u-m', merchantId: 'm-1' });
  });

  it('출고 권한이 없으면 403 — 고치지 않는다', async () => {
    getActor.mockResolvedValue(customer);

    expect((await call()).status).toBe(403);
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);

    expect((await call()).status).toBe(401);
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
  });

  /**
   * **무엇을 무엇으로 바꿨는지 남는다.** 주소만 남기면 "누가 여기로 보내라고 했는지" 를 물을 때 답할 수
   * 없다 — 바꾸기 전 값이 있어야 그 한 줄이 기록이 된다.
   */
  it('바꾼 뒤 전후 값을 감사 로그에 남긴다', async () => {
    await call();

    expect(audit.recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      actor: admin,
      action: 'order.address',
      targetType: 'order',
      targetId: '20260901-0000001',
      before,
      after,
    }));
  });

  it('막혔으면 기록하지 않는다 — 안 바뀐 일이 바뀐 것처럼 남으면 안 된다', async () => {
    lib.updateOrderAddress.mockRejectedValue(new AddressEditError('ALREADY_SHIPPED'));

    const res = await call();

    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('출고 전까지');
    expect(audit.recordAudit).not.toHaveBeenCalled();
  });

  it('칸이 틀리면 어느 칸인지와 함께 400', async () => {
    const res = await call({ ...body, postalCode: '12' });

    expect(res.status).toBe(400);
    expect((await res.json()).fields).toHaveProperty('postalCode');
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
  });

  it('글이 아니면 400 으로 받는다', async () => {
    expect((await call('{')).status).toBe(400);
  });
});
