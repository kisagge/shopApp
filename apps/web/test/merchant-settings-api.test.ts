import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 가맹점 정보 창구.
 *
 * **창구를 둘로 나눈 것이 곧 권한을 나눈 것이다.** 한 창구로 받아 놓고 안에서 칸을 골라 거르면, 화면이 안 보여 주는 칸을
 * 요청에 끼워 넣는 길이 남는다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const db = vi.hoisted(() => ({
  merchant: {
    findUnique: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { PUT, PATCH } = await import('~/app/api/admin/merchants/[id]/settings/route');
const { PUT: COMMISSION_PUT } = await import('~/app/api/admin/merchants/[id]/commission/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const settings = {
  contactEmail: 'contact@studionoon.test',
  contactPhone: '010-1111-2222',
  settlementBank: 'KB',
  settlementAccount: '123-4567-8901',
  settlementHolder: '스튜디오눈',
};

const business = {
  name: '스튜디오눈',
  businessName: '스튜디오눈 주식회사',
  businessNumber: '1234567890',
  representative: '김대표',
};

const stored = {
  id: 'm-a', name: '스튜디오눈', status: 'APPROVED',
  businessName: '스튜디오눈 주식회사', businessNumber: '123-45-67890', representative: '김대표',
  contactEmail: 'old@studionoon.test', contactPhone: '010-0000-0000', commissionPercent: 15,
  settlementBank: null, settlementAccount: null, settlementHolder: null,
};

const call = (method: 'PUT' | 'PATCH', input: unknown, id = 'm-a') => {
  const request = new Request(`http://localhost/api/admin/merchants/${id}/settings`, {
    method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  });
  const params = { params: Promise.resolve({ id }) };
  return method === 'PUT' ? PUT(request, params) : PATCH(request, params);
};

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  db.merchant.findUnique.mockResolvedValue(stored);
  db.merchant.update.mockImplementation(async ({ data }: any) => ({ ...stored, ...data }));
});

describe('PUT — 연락처와 정산 계좌', () => {
  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call('PUT', settings)).status).toBe(401);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('가맹점은 자기 계좌를 고친다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('PUT', settings)).status).toBe(200);
    expect(db.merchant.update.mock.calls[0]![0].data).toMatchObject({ settlementBank: 'KB' });
  });

  it('남의 가맹점은 못 고친다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('PUT', settings, 'm-b')).status).toBe(403);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('계좌번호는 숫자만 남겨 저장한다 — 하이픈 유무로 같은 계좌가 둘이 되면 안 된다', async () => {
    await call('PUT', settings);
    expect(db.merchant.update.mock.calls[0]![0].data.settlementAccount).toBe('12345678901');
  });

  it('말이 안 되는 은행·계좌는 칸 이름과 함께 거절한다', async () => {
    const response = await call('PUT', { ...settings, settlementBank: '국민', settlementAccount: '123' });
    expect(response.status).toBe(400);
    const failed = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(failed.fields).sort()).toEqual(['settlementAccount', 'settlementBank']);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('감사 로그에 남기되 계좌번호는 뒤 네 자리만 남긴다', async () => {
    await call('PUT', settings);
    const logged = recordAudit.mock.calls[0]![0];
    expect(logged).toMatchObject({ action: 'merchant.updateSettings', targetType: 'merchant', targetId: 'm-a' });
    expect(logged.after.accountTail).toBe('*******8901');
    // 전체 번호가 로그로 새면 안 된다
    expect(JSON.stringify(logged)).not.toContain('12345678901');
  });
});

describe('PATCH — 사업자 정보', () => {
  it('가맹점은 못 고친다 — 정산과 세금계산서의 근거다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call('PATCH', business)).status).toBe(403);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('운영진은 고치고, 사업자번호는 표준 표기로 맞춘다', async () => {
    expect((await call('PATCH', business)).status).toBe(200);
    expect(db.merchant.update.mock.calls[0]![0].data.businessNumber).toBe('123-45-67890');
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'merchant.updateBusiness' });
  });

  it('같은 이름이나 사업자번호가 이미 있으면 그렇게 말한다', async () => {
    // "저장하지 못했습니다" 만 돌려주면 무엇을 고쳐야 할지 알 수 없다
    db.merchant.update.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const response = await call('PATCH', business);
    expect(response.status).toBe(409);
    expect((await response.json()).message).toContain('이미 있습니다');
  });

  it('없는 가맹점이면 404', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    expect((await call('PATCH', business)).status).toBe(404);
  });
});

describe('PUT /commission — 수수료율', () => {
  const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
  const body = { commissionPercent: 12, reason: '2026년 재계약' };

  const callCommission = (input: unknown, id = 'm-a') =>
    COMMISSION_PUT(
      new Request(`http://localhost/api/admin/merchants/${id}/commission`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
      }),
      { params: Promise.resolve({ id }) },
    );

  it('슈퍼관리자만 바꾼다 — 입점을 승인하는 사람이 조건도 정한다', async () => {
    getActor.mockResolvedValue(superAdmin);
    expect((await callCommission(body)).status).toBe(200);
    expect(db.merchant.update.mock.calls[0]![0].data).toEqual({ commissionPercent: 12 });
  });

  it('관리자는 못 바꾼다 — 요율을 내리고 지급까지 집행하는 길을 한 사람이 완결하면 안 된다', async () => {
    getActor.mockResolvedValue(admin);
    expect((await callCommission(body)).status).toBe(403);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('가맹점은 자기 몫을 자기가 정하지 못한다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await callCommission(body)).status).toBe(403);
  });

  it('절반을 넘는 요율과 빈 사유는 거절한다', async () => {
    getActor.mockResolvedValue(superAdmin);
    const response = await callCommission({ commissionPercent: 80, reason: '  ' });
    expect(response.status).toBe(400);
    const failed = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(failed.fields).sort()).toEqual(['commissionPercent', 'reason']);
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('바뀐 값과 사유를 감사 로그에 남긴다', async () => {
    // 숫자만 바뀐 기록은 "왜 이 요율이 됐는가" 에 답하지 못한다
    getActor.mockResolvedValue(superAdmin);
    await callCommission(body);
    const logged = recordAudit.mock.calls[0]![0];
    expect(logged).toMatchObject({ action: 'merchant.commission', targetType: 'merchant', targetId: 'm-a' });
    expect(logged.before).toEqual({ commissionPercent: 15 });
    expect(logged.after).toEqual({ commissionPercent: 12, reason: '2026년 재계약' });
  });
});
