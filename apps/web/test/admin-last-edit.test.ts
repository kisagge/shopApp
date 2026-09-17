import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

/**
 * 한 벌짜리 설정을 마지막으로 고친 사람.
 *
 * 배송 정책·반품지·약관은 고친 사람을 **적어 두기만 했다** — 화면에는 지금 값만 있었다. 누가 보느냐에 따라 적는 말이
 * 달라지는지(가맹점에게 운영진의 이름은 새지 않는다), 사람을 한 번에 묻는지 본다.
 */

vi.mock('server-only', () => ({}));
const db = vi.hoisted(() => ({
  shippingPolicy: { findUnique: vi.fn<(...a: any[]) => any>() },
  returnAddress: { findFirst: vi.fn<(...a: any[]) => any>() },
  policy: { findMany: vi.fn<(...a: any[]) => any>() },
  user: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getShippingPolicyEdit, getReturnAddressEdit, getPolicyEdits } = await import('~/lib/queries/admin/last-edit');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const AT = new Date('2026-09-15T06:20:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findMany.mockResolvedValue([
    { id: 'u-park', name: '박운영', role: 'ADMIN', merchantId: null },
    { id: 'u-colleague', name: '무어 담당자', role: 'MERCHANT', merchantId: 'm-a' },
  ]);
});

describe('배송 정책', () => {
  it('운영진에게는 고친 사람의 이름과 역할을', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue({ updatedAt: AT, updatedById: 'u-park' });

    expect(await getShippingPolicyEdit(admin)).toEqual({ at: AT, by: '박운영 · 관리자' });
    expect(db.shippingPolicy.findUnique.mock.calls[0]![0]).toEqual({
      where: { id: 'default' }, select: { updatedAt: true, updatedById: true },
    });
  });

  it('한 번도 저장하지 않았으면 없다 — 기본값으로 도는 중이다', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue(null);

    expect(await getShippingPolicyEdit(admin)).toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('고친 사람 칸이 생기기 전의 줄이면 기록이 없다고, 계정이 지워졌으면 탈퇴한 계정이라고', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue({ updatedAt: AT, updatedById: null });
    expect((await getShippingPolicyEdit(admin))?.by).toBe('기록 없음');

    db.shippingPolicy.findUnique.mockResolvedValue({ updatedAt: AT, updatedById: 'u-gone' });
    expect((await getShippingPolicyEdit(admin))?.by).toBe('탈퇴한 계정');
  });
});

describe('반품지', () => {
  it('가맹점에게 운영진이 고쳤으면 "운영진" — 이름은 새지 않는다', async () => {
    db.returnAddress.findFirst.mockResolvedValue({ updatedAt: AT, updatedById: 'u-park' });

    expect(await getReturnAddressEdit(merchant, 'm-a')).toEqual({ at: AT, by: '운영진' });
    expect(db.returnAddress.findFirst.mock.calls[0]![0].where).toEqual({ merchantId: 'm-a' });
  });

  it('같은 가맹점 동료가 고쳤으면 이름으로', async () => {
    db.returnAddress.findFirst.mockResolvedValue({ updatedAt: AT, updatedById: 'u-colleague' });
    expect((await getReturnAddressEdit(merchant, 'm-a'))?.by).toBe('무어 담당자');
  });

  it('자사 상품 반품지는 가맹점 없는 줄이다', async () => {
    db.returnAddress.findFirst.mockResolvedValue(null);

    expect(await getReturnAddressEdit(admin, null)).toBeNull();
    expect(db.returnAddress.findFirst.mock.calls[0]![0].where).toEqual({ merchantId: null });
  });
});

describe('약관·방침', () => {
  it('문서마다 고친 사람을 모으되 사람은 한 번에 묻는다', async () => {
    db.policy.findMany.mockResolvedValue([
      { kind: 'TERMS', updatedAt: AT, updatedById: 'u-park' },
      { kind: 'PRIVACY', updatedAt: AT, updatedById: 'u-park' },
    ]);

    const edits = await getPolicyEdits(admin);

    expect(edits.get('TERMS')).toEqual({ at: AT, by: '박운영 · 관리자' });
    expect(edits.get('PRIVACY')?.by).toBe('박운영 · 관리자');
    expect(db.user.findMany).toHaveBeenCalledOnce();
    expect(db.user.findMany.mock.calls[0]![0].where).toEqual({ id: { in: ['u-park'] } });
  });

  it('아직 쓰지 않은 문서는 빠진다', async () => {
    db.policy.findMany.mockResolvedValue([{ kind: 'TERMS', updatedAt: AT, updatedById: 'u-park' }]);

    const edits = await getPolicyEdits(admin);
    expect(edits.has('PRIVACY')).toBe(false);
  });
});

/** 그 설정을 고칠 수 있는 사람만 — 고치는 화면에만 뜨는 줄이다. 막히면 DB 를 치지 않는다 */
describe('권한', () => {
  const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

  it('손님은 어느 것도 읽지 못한다', async () => {
    await expect(getShippingPolicyEdit(customer)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReturnAddressEdit(customer, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getPolicyEdits(customer)).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.shippingPolicy.findUnique).not.toHaveBeenCalled();
    expect(db.returnAddress.findFirst).not.toHaveBeenCalled();
    expect(db.policy.findMany).not.toHaveBeenCalled();
  });

  it('가맹점은 가게 전체의 설정과 남의 가맹점 반품지를 읽지 못한다', async () => {
    await expect(getShippingPolicyEdit(merchant)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReturnAddressEdit(merchant, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getReturnAddressEdit(merchant, 'm-other')).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.returnAddress.findFirst).not.toHaveBeenCalled();
  });
});
