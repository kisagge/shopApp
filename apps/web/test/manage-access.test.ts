import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { assignRoleSchema, updateMerchantStatusSchema } from '@shop/contract';

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  user: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const activate = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/merchant/apply', () => ({ activateApprovedMerchant: activate }));

const { updateMerchantStatus, assignRole } = await import('~/lib/admin/manage-access');

const superAdmin: Actor = { id: 'u-super', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const MERCHANT_ID = 'clh1abc2300000000000000000';

const status = (raw: unknown) => updateMerchantStatusSchema.parse(raw);
const role = (raw: unknown) => assignRoleSchema.parse(raw);

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findUnique.mockResolvedValue({
    id: MERCHANT_ID, name: '무어', status: 'PENDING', approvedAt: null,
  });
  db.merchant.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: MERCHANT_ID, name: '무어', approvedAt: null, ...data }));
  db.user.findUnique.mockResolvedValue({
    id: 'u-target', name: '홍길동', email: 'a@b.test', role: 'CUSTOMER',
    merchantId: null, deletedAt: null,
  });
  db.user.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'u-target', name: '홍길동', email: 'a@b.test', ...data }));
});

describe('입점 승인 — 권한', () => {
  it('관리자에게는 merchant:approve 가 없다', async () => {
    await expect(
      updateMerchantStatus(admin, MERCHANT_ID, status({ status: 'APPROVED' })),
    ).rejects.toThrow();
    expect(db.merchant.update).not.toHaveBeenCalled();
  });

  it('가맹점 자신도 못 한다', async () => {
    await expect(
      updateMerchantStatus(merchant, MERCHANT_ID, status({ status: 'APPROVED' })),
    ).rejects.toThrow();
  });

  it('슈퍼관리자는 승인할 수 있다', async () => {
    const { after } = await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));
    expect(after.status).toBe('APPROVED');
  });
});

describe('입점 승인 — 승인 시각', () => {
  it('처음 승인할 때 찍는다', async () => {
    await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));
    expect(db.merchant.update.mock.calls[0]?.[0].data.approvedAt).toBeInstanceOf(Date);
  });

  it('정지했다 다시 승인해도 최초 입점일을 밀지 않는다', async () => {
    db.merchant.findUnique.mockResolvedValue({
      id: MERCHANT_ID, name: '무어', status: 'SUSPENDED', approvedAt: new Date('2026-01-01'),
    });
    await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));
    // 정산 기간이 이 날짜를 기준으로 계산된다
    expect(db.merchant.update.mock.calls[0]?.[0].data.approvedAt).toBeUndefined();
  });

  it('없는 가맹점은 404', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    await expect(
      updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' })),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_FOUND', status: 404 });
  });
});

describe('입점 승인 — 계약', () => {
  it('정지에는 사유가 필요하다', () => {
    expect(updateMerchantStatusSchema.safeParse({ status: 'SUSPENDED' }).success).toBe(false);
    expect(
      updateMerchantStatusSchema.safeParse({ status: 'SUSPENDED', reason: '정산 계좌 확인 불가' }).success,
    ).toBe(true);
  });

  it('해지에도 사유가 필요하다', () => {
    expect(updateMerchantStatusSchema.safeParse({ status: 'TERMINATED' }).success).toBe(false);
  });

  it('승인에는 사유가 없어도 된다', () => {
    expect(updateMerchantStatusSchema.safeParse({ status: 'APPROVED' }).success).toBe(true);
  });
});

describe('권한 부여', () => {
  const grant = { role: 'ADMIN', reason: '운영팀 합류' };

  it('관리자는 권한을 줄 수 없다 — 스스로 올리는 경로를 막는다', async () => {
    await expect(assignRole(admin, 'u-target', role(grant))).rejects.toThrow();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('슈퍼관리자는 줄 수 있다', async () => {
    const { after } = await assignRole(superAdmin, 'u-target', role(grant));
    expect(after.role).toBe('ADMIN');
  });

  it('자기 권한은 못 바꾼다', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u-super', name: '나', email: 's@b.test', role: 'SUPER_ADMIN',
      merchantId: null, deletedAt: null,
    });
    await expect(assignRole(superAdmin, 'u-super', role(grant))).rejects.toMatchObject({
      code: 'CANNOT_CHANGE_OWN_ROLE', status: 403,
    });
  });

  it('없는 회원은 404', async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(assignRole(superAdmin, 'u-x', role(grant))).rejects.toMatchObject({
      code: 'USER_NOT_FOUND', status: 404,
    });
  });

  it('탈퇴한 계정에는 권한을 주지 않는다', async () => {
    /*
     * 탈퇴해도 행은 남아 목록에 보이고 id 도 그대로다. 막지 않으면 들어올
     * 길이 없는 계정에 운영 권한이 붙고, 나중에 되살아나면 그대로 들고 온다.
     */
    db.user.findUnique.mockResolvedValue({
      id: 'u-target', name: '탈퇴한 회원', email: 'withdrawn-u-target@removed.invalid',
      role: 'CUSTOMER', merchantId: null, deletedAt: new Date('2026-09-01'),
    });

    await expect(assignRole(superAdmin, 'u-target', role(grant))).rejects.toMatchObject({
      code: 'USER_CLOSED', status: 409,
    });
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('가맹점으로 올릴 때 소속을 확인한다', async () => {
    db.merchant.findUnique.mockResolvedValue({ status: 'APPROVED' });
    await assignRole(superAdmin, 'u-target', role({
      role: 'MERCHANT', merchantId: MERCHANT_ID, reason: '입점 담당자',
    }));
    expect(db.user.update.mock.calls[0]?.[0].data).toEqual({
      role: 'MERCHANT', merchantId: MERCHANT_ID,
    });
  });

  it('승인 전 가맹점에는 계정을 붙일 수 없다 — 승인 절차를 건너뛰게 된다', async () => {
    db.merchant.findUnique.mockResolvedValue({ status: 'PENDING' });
    await expect(
      assignRole(superAdmin, 'u-target', role({
        role: 'MERCHANT', merchantId: MERCHANT_ID, reason: '입점 담당자',
      })),
    ).rejects.toMatchObject({ code: 'MERCHANT_NOT_APPROVED', status: 409 });
  });

  it('가맹점에서 내릴 때 소속을 끊는다', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u-target', name: '홍길동', email: 'a@b.test', role: 'MERCHANT',
      merchantId: MERCHANT_ID, deletedAt: null,
    });
    await assignRole(superAdmin, 'u-target', role({ role: 'CUSTOMER', reason: '퇴사' }));
    // 소속이 남으면 권한만 내려가고 범위는 그대로인 계정이 된다
    expect(db.user.update.mock.calls[0]?.[0].data.merchantId).toBeNull();
  });

  it('변경 전 값을 감사 로그용으로 돌려준다', async () => {
    const { before } = await assignRole(superAdmin, 'u-target', role(grant));
    expect(before).toEqual({ role: 'CUSTOMER', merchantId: null });
  });
});

describe('권한 부여 — 계약', () => {
  it('소속 없는 가맹점 계정은 만들 수 없다', () => {
    expect(assignRoleSchema.safeParse({ role: 'MERCHANT', reason: 'x' }).success).toBe(false);
  });

  it('가맹점이 아닌데 소속을 주면 거절한다', () => {
    expect(
      assignRoleSchema.safeParse({ role: 'ADMIN', merchantId: MERCHANT_ID, reason: 'x' }).success,
    ).toBe(false);
  });

  it('사유는 필수다 — 감사 로그에 왜 가 빠지면 나중에 판단할 수 없다', () => {
    expect(assignRoleSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(assignRoleSchema.safeParse({ role: 'ADMIN', reason: '   ' }).success).toBe(false);
  });
});

describe('승인하면 계정과 브랜드가 이어진다', () => {
  it('APPROVED 로 바꿀 때만 활성화를 부른다', async () => {
    /*
     * 상태만 바꾸면 승인된 가맹점이 로그인해도 아무것도 할 수 없고, 결국
     * 운영진이 계정과 브랜드를 손으로 만들어 줘야 한다.
     */
    await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));
    expect(activate).toHaveBeenCalledWith(MERCHANT_ID);
  });

  it('정지·해지에는 부르지 않는다', async () => {
    for (const s of ['SUSPENDED', 'TERMINATED'] as const) {
      activate.mockClear();
      // 불이익을 주는 처분에는 사유가 필요하다(계약이 강제한다)
      await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: s, reason: '시험' }));
      expect(activate, s).not.toHaveBeenCalled();
    }
  });
});
