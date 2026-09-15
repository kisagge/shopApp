import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 반품지 창구 — 누가 어느 반품지를 고칠 수 있는가, 그리고 저장할 때 무엇으로 바꾸는가.
 *
 * 주소를 바꾸면 그다음 승인부터 손님이 물건을 보내는 곳이 바뀐다. 남의 가맹점 반품지를 고칠 수 있으면 남의 가게로 갈
 * 물건을 자기 창고로 돌릴 수 있다 — 권한을 제일 먼저 본다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { PUT } = await import('~/app/api/admin/return-addresses/[owner]/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const input = {
  recipient: '스튜디오눈 반품담당',
  phone: '01000000101',
  postalCode: '04799',
  address1: '서울 성동구 성수이로 00',
  address2: '물류창고 1층',
};

const call = (owner: string, body: unknown = input) =>
  PUT(
    new Request(`http://localhost/api/admin/return-addresses/${owner}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ owner }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  db.merchant.findUnique.mockResolvedValue({ id: 'm-a' });
  db.returnAddress.findUnique.mockResolvedValue(null);
  db.returnAddress.upsert.mockImplementation(async ({ update, create }: any) => ({
    merchantId: create?.merchantId ?? null, ...(update ?? create),
  }));
});

describe('PUT /api/admin/return-addresses/[owner]', () => {
  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call('m-a')).status).toBe(401);
  });

  it('가맹점은 자기 반품지를 고친다', async () => {
    getActor.mockResolvedValue(merchant);
    const response = await call('m-a');
    expect(response.status).toBe(200);
    expect(db.returnAddress.upsert).toHaveBeenCalled();
  });

  it('남의 가맹점 반품지는 못 고친다 — 그 가게로 갈 물건을 돌릴 수 있다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('m-b')).status).toBe(403);
    expect(db.returnAddress.upsert).not.toHaveBeenCalled();
  });

  it('자사 상품 반품지는 배송 정책 권한이 있어야 한다 — 가맹점은 못 고친다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('platform')).status).toBe(403);

    getActor.mockResolvedValue(admin);
    expect((await call('platform')).status).toBe(200);
    // 플랫폼 반품지는 id 로 찾는다 — merchantId 가 null 인 줄은 유니크로 하나를 고를 수 없다
    expect(db.returnAddress.upsert.mock.calls[0]![0].where).toEqual({ id: 'platform' });
  });

  it('없는 가맹점이면 404', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    expect((await call('m-zzz')).status).toBe(404);
  });

  it('연락처를 한 모양으로 저장한다 — 같은 번호가 두 모양이면 사람이 못 알아본다', async () => {
    await call('m-a');
    expect(db.returnAddress.upsert.mock.calls[0]![0].update).toMatchObject({
      phone: '010-0000-0101', recipient: '스튜디오눈 반품담당', updatedById: 'u-a',
    });
  });

  it('형식이 틀린 우편번호·연락처는 칸 이름과 함께 거절한다', async () => {
    const response = await call('m-a', { ...input, postalCode: '0479', phone: '1234' });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(body.fields).sort()).toEqual(['phone', 'postalCode']);
    expect(db.returnAddress.upsert).not.toHaveBeenCalled();
  });

  it('전후 값을 감사 로그에 남긴다 — 언제 어디에서 어디로 바뀌었는지가 근거다', async () => {
    db.returnAddress.findUnique.mockResolvedValue({
      merchantId: 'm-a', recipient: '옛 담당', phone: '010-0000-0000',
      postalCode: '06035', address1: '서울 강남구 가로수길 00', address2: null,
    });
    await call('m-a');
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      action: 'returnAddress.update',
      targetType: 'return_address',
      targetId: 'm-a',
      before: { recipient: '옛 담당' },
      after: { recipient: '스튜디오눈 반품담당' },
    });
  });
});
