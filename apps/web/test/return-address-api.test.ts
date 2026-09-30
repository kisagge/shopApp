import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 반품지 창구 — 누가 어느 반품지를 고칠 수 있는가, 그리고 저장할 때 무엇으로 바꾸는가.
 *
 * 주소를 바꾸면 그다음 승인부터 손님이 물건을 보내는 곳이 바뀐다. 남의 가맹점 반품지를 고칠 수 있으면 남의 가게로 갈
 * 물건을 자기 창고로 돌릴 수 있다 — 권한을 제일 먼저 본다.
 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getActor = session.getActor;
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findUnique: vi.fn<(...a: any[]) => any>(), upsert: vi.fn<(...a: any[]) => any>() },
  // 바꾸기 전에 "이 주소로 보내라고 안내받은" 신청을 센다
  returnRequest: { findMany: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>() },
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
  db.returnRequest.findMany.mockResolvedValue([]);
  db.notification.createMany.mockResolvedValue({ count: 0 });
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

/**
 * 반품지가 바뀌면, 그 주소로 보내라고 안내받은 손님에게 말해 준다.
 *
 * **손님은 이 주소를 상자에 적었다.** 승인하면 주문 화면에 "이 주소로 보내 주세요" 가 뜨고 사람은 그것을
 * 적는다 — 그 뒤에 주소를 바꾸면 화면은 조용히 바뀌지만 이미 적어 둔 사람에게는 아무 말도 가지 않았다.
 * 물건은 옛 창고로 가고 아무도 그것을 기다리지 않는다.
 */
describe('반품지가 바뀌면', () => {
  /** 승인했고 아직 도착하지 않은 신청 — 그 줄이 이 판매처의 것 */
  const awaiting = (merchantId: string | null) => [{
    itemIds: ['i-1'],
    order: {
      orderNo: '20260930-0000001',
      userId: 'u-cust',
      items: [{ id: 'i-1', status: 'RETURN_REQUESTED', canceledAt: null, merchantId }],
    },
  }];

  const written = () => db.notification.createMany.mock.calls[0]?.[0].data as Record<string, unknown>[] | undefined;

  it('안내받은 손님에게 알린다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));
    db.returnAddress.findUnique.mockResolvedValue({
      merchantId: 'm-a', recipient: '반품담당', phone: '010-0000-0101',
      postalCode: '04799', address1: '서울 성동구 성수이로 00', address2: '1층',
    });

    const res = await call('m-a', { ...input, address1: '서울 성동구 성수이로 99' });

    expect(res.status).toBe(200);
    expect(written()).toEqual([
      expect.objectContaining({
        userId: 'u-cust',
        kind: 'RETURN_ADDRESS_CHANGED',
        linkPath: '/order/20260930-0000001',
      }),
    ]);
  });

  /** 다른 판매처로 보내는 사람에게는 이 주소가 아무 상관이 없다 */
  it('다른 판매처로 보내는 신청은 세지 않는다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-b'));
    db.returnAddress.findUnique.mockResolvedValue({
      merchantId: 'm-a', recipient: '반품담당', phone: '010-0000-0101',
      postalCode: '04799', address1: '서울 성동구 성수이로 00', address2: '1층',
    });

    await call('m-a', { ...input, address1: '서울 성동구 성수이로 99' });

    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  /** 저장해도 폼이 남아 있어 같은 값을 두 번 누르기 쉽다 — 그때마다 알리면 아무도 믿지 않는다 */
  it('같은 값을 다시 저장한 것은 알리지 않는다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));
    // 저장 규칙대로 다듬은 뒤의 값이 지금 값과 같다 — 전화번호는 하이픈이 붙어 저장된다
    db.returnAddress.findUnique.mockResolvedValue({
      merchantId: 'm-a', ...input, phone: '010-0000-0101',
    });

    await call('m-a', input);

    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  /** 반품지가 없으면 승인할 수 없다 — 그 전에 이 주소로 보내라고 안내받은 사람은 없다 */
  it('처음 등록한 것은 알리지 않는다', async () => {
    db.returnRequest.findMany.mockResolvedValue(awaiting('m-a'));
    db.returnAddress.findUnique.mockResolvedValue(null);

    await call('m-a', input);

    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});
