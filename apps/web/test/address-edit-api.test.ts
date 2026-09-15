import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 배송지 고치기 창구 — 로그인, 계약 검사(칸별 오류), 없는 배송지 */

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const lib = vi.hoisted(() => ({
  updateAddress: vi.fn<(...a: any[]) => any>(),
  setDefaultAddress: vi.fn<(...a: any[]) => any>(),
  deleteAddress: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('~/lib/addresses/manage-address', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/addresses/manage-address')>()),
  ...lib,
}));

const { AddressError } = await import('~/lib/addresses/manage-address');
const { PUT } = await import('~/app/api/addresses/[id]/route');

const body = { recipient: '장보영', phone: '010-1234-5678', postalCode: '04766', address1: '서울 성동구 왕십리로 1' };
const call = (b: unknown) =>
  PUT(new Request('http://localhost/api/addresses/a-1', { method: 'PUT', body: JSON.stringify(b) }), { params: Promise.resolve({ id: 'a-1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  lib.updateAddress.mockResolvedValue({ id: 'a-1', ...body });
});

describe('PUT /api/addresses/[id]', () => {
  it('고친 배송지를 돌려준다', async () => {
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(lib.updateAddress).toHaveBeenCalledWith('u-1', 'a-1', expect.objectContaining({ recipient: '장보영' }));
    expect((await res.json()).address.id).toBe('a-1');
  });

  it('칸이 틀리면 어느 칸인지와 함께 400 — 고치지 않는다', async () => {
    const res = await call({ ...body, postalCode: '12' });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toHaveProperty('postalCode');
    expect(lib.updateAddress).not.toHaveBeenCalled();
  });

  it('로그인하지 않았으면 401, 없는 배송지면 404', async () => {
    getSessionUser.mockResolvedValueOnce(null);
    expect((await call(body)).status).toBe(401);
    lib.updateAddress.mockRejectedValue(new AddressError('NOT_FOUND', 404));
    expect((await call(body)).status).toBe(404);
  });
});
