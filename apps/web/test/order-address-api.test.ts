import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 배송지 수정 창구 — 로그인, 요청 제한, 계약 검사(칸별 오류), 막힌 이유를 그대로 전한다 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getSessionUser = session.getSessionUser;

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const lib = vi.hoisted(() => ({ updateOrderAddress: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/orders/update-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/orders/update-address')>()),
  ...lib,
}));

const { AddressEditError } = await import('~/lib/orders/update-address');
const { PATCH } = await import('~/app/api/orders/[orderNo]/address/route');

const body = {
  recipient: '장보영',
  phone: '010-1234-5678',
  postalCode: '04766',
  address1: '서울 성동구 왕십리로 1',
  address2: '101동 1001호',
};

const call = (b: unknown) =>
  PATCH(
    new Request('http://localhost/api/orders/20260901-0000001/address', {
      method: 'PATCH',
      body: typeof b === 'string' ? b : JSON.stringify(b),
    }),
    { params: Promise.resolve({ orderNo: '20260901-0000001' }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  enforceRateLimit.mockResolvedValue(null);
  lib.updateOrderAddress.mockResolvedValue({
    orderNo: '20260901-0000001', shippingDelta: 0, shippingFee: 3_000, payable: 103_000, isRemoteArea: false,
  });
});

describe('PATCH /api/orders/[orderNo]/address', () => {
  it('고친 결과를 돌려준다 — 세션의 주인으로 묶어서 부른다', async () => {
    const res = await call(body);

    expect(res.status).toBe(200);
    expect(lib.updateOrderAddress).toHaveBeenCalledWith(
      '20260901-0000001',
      expect.objectContaining({ recipient: '장보영' }),
      { userId: 'u-1' },
    );
    expect(await res.json()).toMatchObject({ shippingDelta: 0 });
  });

  it('바뀐 배송비를 함께 실어 준다 — 조용히 달라지면 안 된다', async () => {
    lib.updateOrderAddress.mockResolvedValue({
      orderNo: '20260901-0000001', shippingDelta: 3_000, shippingFee: 6_000, payable: 106_000, isRemoteArea: true,
    });

    expect(await (await call({ ...body, postalCode: '63000' })).json())
      .toMatchObject({ shippingDelta: 3_000, shippingFee: 6_000, isRemoteArea: true });
  });

  it('로그인하지 않았으면 401 — 아무것도 고치지 않는다', async () => {
    getSessionUser.mockResolvedValue(null);

    expect((await call(body)).status).toBe(401);
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
  });

  /** 남의 주문번호를 훑으며 주소를 갈아 보는 시도를 값싸게 만들지 않는다 */
  it('요청이 잦으면 일을 시작하기 전에 막는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));

    expect((await call(body)).status).toBe(429);
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
  });

  it('칸이 틀리면 어느 칸인지와 함께 400 — 고치지 않는다', async () => {
    const res = await call({ ...body, postalCode: '12' });

    expect(res.status).toBe(400);
    expect((await res.json()).fields).toHaveProperty('postalCode');
    expect(lib.updateOrderAddress).not.toHaveBeenCalled();
  });

  it('글이 아니면 400 으로 받는다', async () => {
    expect((await call('{')).status).toBe(400);
  });

  /** 왜 안 되는지 그대로 전해야 손님이 다음 수(취소 후 재주문)를 안다 */
  it('막힌 이유를 409 와 문장으로 전한다', async () => {
    lib.updateOrderAddress.mockRejectedValue(new AddressEditError('ZONE_CHANGE_AFTER_PAYMENT'));

    const res = await call({ ...body, postalCode: '63000' });

    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('도서산간');
  });

  it('없는 주문이면 404', async () => {
    lib.updateOrderAddress.mockRejectedValue(new AddressEditError('ORDER_NOT_FOUND', 404));

    expect((await call(body)).status).toBe(404);
  });
});
