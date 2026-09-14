import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { assignRoleSchema, suspendUserSchema, updateMerchantStatusSchema } from '@shop/contract';

const db = vi.hoisted(() => {
  const inner = {
    merchant: {
      findUnique: vi.fn<(...a: any[]) => any>(),
      update: vi.fn<(...a: any[]) => any>(),
      updateMany: vi.fn<(...a: any[]) => any>(),
    },
    user: {
      findUnique: vi.fn<(...a: any[]) => any>(),
      findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
      updateMany: vi.fn<(...a: any[]) => any>(),
    },
    session: {
      deleteMany: vi.fn<(...a: any[]) => any>(),
    },
  };
  // $transaction(콜백) 은 같은 클라이언트를 넘겨준다 — 흉내도 그렇게 한다
  return { ...inner, $transaction: vi.fn((fn: any) => fn(inner)) };
});
vi.mock('@shop/db', () => ({ prisma: db }));

const activate = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/merchant/apply', () => ({ activateApprovedMerchant: activate }));

const { updateMerchantStatus, assignRole, suspendUser } = await import('~/lib/admin/manage-access');

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
  db.merchant.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUnique.mockResolvedValue({
    id: 'u-target', name: '홍길동', email: 'a@b.test', role: 'CUSTOMER',
    merchantId: null, deletedAt: null,
  });
  db.user.updateMany.mockResolvedValue({ count: 1 });
  db.user.findUniqueOrThrow.mockResolvedValue({
    id: 'u-target', name: '홍길동', email: 'a@b.test', role: 'ADMIN', merchantId: null,
  });
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
    expect(db.merchant.updateMany.mock.calls[0]?.[0].data.approvedAt).toBeInstanceOf(Date);
  });

  it('정지했다 다시 승인해도 최초 입점일을 밀지 않는다', async () => {
    db.merchant.findUnique.mockResolvedValue({
      id: MERCHANT_ID, name: '무어', status: 'SUSPENDED', approvedAt: new Date('2026-01-01'),
    });
    await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));
    /*
     * 정산 기간이 이 날짜를 기준으로 계산된다.
     *
     * 이제 **읽어 온 값으로 판단하지 않는다.** 조건을 where 에 실어 쓰는
     * 순간에 확인하므로, 이미 찍혀 있으면 0건이 되고 덮이지 않는다.
     */
    expect(db.merchant.updateMany.mock.calls[0]?.[0].where.approvedAt).toBeNull();
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
    expect(db.user.updateMany).not.toHaveBeenCalled();
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
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('가맹점으로 올릴 때 소속을 확인한다', async () => {
    db.merchant.findUnique.mockResolvedValue({ status: 'APPROVED' });
    await assignRole(superAdmin, 'u-target', role({
      role: 'MERCHANT', merchantId: MERCHANT_ID, reason: '입점 담당자',
    }));
    expect(db.user.updateMany.mock.calls[0]?.[0].data).toEqual({
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
    expect(db.user.updateMany.mock.calls[0]?.[0].data.merchantId).toBeNull();
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

/**
 * 읽은 뒤 쓰기 전에 대상이 바뀌는 경우.
 *
 * 권한 검사는 전부 **읽은 시점의 값**으로 판단한다. 그 사이에 대상이 바뀌면
 * 그 판단이 무의미해지는데, 가장 나쁜 경우는 대상이 슈퍼관리자가 되는 것이다
 * — 슈퍼관리자는 못 건드리게 막아 뒀는데 그 검사를 그대로 지나쳐 강등된다.
 *
 * 창이 좁아서 눈으로는 절대 못 본다. 그래서 **읽은 상태를 쓰기 조건에 함께
 * 싣고**, 안 맞으면 0건이 되게 했다. 재고를 깎을 때와 같은 방식이다.
 */
describe('권한 부여 — 그 사이에 바뀌면', () => {
  it('읽은 상태를 그대로 쓰기 조건에 싣는다', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u-target', name: '홍길동', email: 'a@b.test',
      role: 'ADMIN', merchantId: null, deletedAt: null,
    });
    // 승인 전 가맹점에는 계정을 못 붙인다 — 그 검사가 먼저 걸리지 않게 둔다
    db.merchant.findUnique.mockResolvedValue({ status: 'APPROVED' });

    await assignRole(superAdmin, 'u-target', role({ role: 'MERCHANT', merchantId: MERCHANT_ID, reason: '입점 승인에 따른 계정 연결' }));

    const where = db.user.updateMany.mock.calls[0]?.[0].where;
    // 셋 다 검사가 기대고 있던 값이다. 하나라도 빠지면 그만큼 창이 열린다.
    expect(where).toMatchObject({ id: 'u-target', role: 'ADMIN', merchantId: null, deletedAt: null });
  });

  it('0건이면 실패로 본다 — 조용히 넘어가지 않는다', async () => {
    db.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      assignRole(superAdmin, 'u-target', role({ role: 'ADMIN', reason: '운영 인수인계' })),
    ).rejects.toMatchObject({ code: 'CHANGED_MEANWHILE', status: 409 });
  });

  it('0건이면 바뀐 값을 돌려주지 않는다', async () => {
    // 여기서 조회까지 하면 "성공한 것처럼 보이는 응답" 이 나간다
    db.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      assignRole(superAdmin, 'u-target', role({ role: 'ADMIN', reason: '운영 인수인계' })),
    ).rejects.toThrow();
    expect(db.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('입점 승인 — 두 사람이 동시에', () => {
  it('최초 승인일을 읽은 값이 아니라 쓰는 순간에 판단한다', async () => {
    /*
     * 둘 다 "아직 비어 있다" 로 읽고 각자 지금 시각을 찍으면 뒤엣것이 이긴다.
     * 그 날짜가 정산 기간의 기준이라 조용히 밀리면 정산이 통째로 어긋난다.
     */
    await updateMerchantStatus(superAdmin, MERCHANT_ID, status({ status: 'APPROVED' }));

    const call = db.merchant.updateMany.mock.calls[0]?.[0];
    expect(call.where).toMatchObject({ id: MERCHANT_ID, approvedAt: null });
  });

  it('승인이 아니면 승인일을 건드리지 않는다', async () => {
    await updateMerchantStatus(
      superAdmin,
      MERCHANT_ID,
      status({ status: 'SUSPENDED', reason: '정산 서류 미비' }),
    );
    expect(db.merchant.updateMany).not.toHaveBeenCalled();
  });
});

describe('이용 정지', () => {
  const suspend = (reason = '결제 도용 신고') => suspendUserSchema.parse({ action: 'SUSPEND', reason });
  const restore = () => suspendUserSchema.parse({ action: 'RESTORE' });
  const NOW = new Date('2026-09-14T10:00:00Z');

  const target = (over: Record<string, unknown> = {}) =>
    db.user.findUnique.mockResolvedValue({
      id: 'u-target', role: 'CUSTOMER', deletedAt: null, suspendedAt: null, suspendedReason: null, ...over,
    });

  it('정지하면 사유·시각·건 사람을 적고, 그 회원의 세션을 전부 지운다 — 이미 로그인한 사람도 끊긴다', async () => {
    target();
    const { after } = await suspendUser(admin, 'u-target', suspend(), NOW);

    const write = db.user.updateMany.mock.calls[0]?.[0];
    expect(write.where).toMatchObject({ id: 'u-target', role: 'CUSTOMER', suspendedAt: null, deletedAt: null });
    expect(write.data).toEqual({ suspendedAt: NOW, suspendedReason: '결제 도용 신고', suspendedBy: 'u-admin' });
    expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-target' } });
    expect(after).toEqual({ suspendedAt: NOW, suspendedReason: '결제 도용 신고' });
  });

  it('자기 자신은 정지할 수 없다', async () => {
    target({ id: 'u-admin', role: 'ADMIN' });
    await expect(suspendUser(admin, 'u-admin', suspend())).rejects.toMatchObject({ code: 'CANNOT_SUSPEND_SELF' });
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });

  it('관리자는 다른 운영진을 정지할 수 없다 — 슈퍼관리자만', async () => {
    target({ role: 'ADMIN' });
    await expect(suspendUser(admin, 'u-target', suspend())).rejects.toMatchObject({ code: 'CANNOT_SUSPEND_STAFF' });
    target({ role: 'ADMIN' });
    await expect(suspendUser(superAdmin, 'u-target', suspend(), NOW)).resolves.toBeTruthy();
  });

  it('가맹점은 회원을 정지할 수 없다', async () => {
    target();
    await expect(suspendUser(merchant, 'u-target', suspend())).rejects.toThrow();
    expect(db.user.updateMany).not.toHaveBeenCalled();
  });

  it('탈퇴한 계정·이미 정지된 계정은 거절한다', async () => {
    target({ deletedAt: new Date() });
    await expect(suspendUser(admin, 'u-target', suspend())).rejects.toMatchObject({ code: 'USER_CLOSED' });
    target({ suspendedAt: new Date() });
    await expect(suspendUser(admin, 'u-target', suspend())).rejects.toMatchObject({ code: 'ALREADY_SUSPENDED' });
  });

  it('그 사이 상태가 바뀌어 0건이면 세션을 지우지 않고 실패한다', async () => {
    target();
    db.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(suspendUser(admin, 'u-target', suspend())).rejects.toMatchObject({ code: 'CHANGED_MEANWHILE' });
    expect(db.session.deleteMany).not.toHaveBeenCalled();
  });

  it('해제하면 세 칸을 비운다. 정지되지 않은 회원은 거절한다', async () => {
    target({ suspendedAt: NOW, suspendedReason: '결제 도용 신고' });
    const { before, after } = await suspendUser(admin, 'u-target', restore());
    expect(db.user.updateMany.mock.calls[0]?.[0].data).toEqual({ suspendedAt: null, suspendedReason: null, suspendedBy: null });
    expect(before).toEqual({ suspendedAt: NOW, suspendedReason: '결제 도용 신고' });
    expect(after).toEqual({ suspendedAt: null, suspendedReason: null });

    target();
    await expect(suspendUser(admin, 'u-target', restore())).rejects.toMatchObject({ code: 'NOT_SUSPENDED' });
  });

  it('사유 없는 정지는 계약에서 막는다', () => {
    expect(suspendUserSchema.safeParse({ action: 'SUSPEND', reason: '  ' }).success).toBe(false);
    expect(suspendUserSchema.safeParse({ action: 'SUSPEND' }).success).toBe(false);
  });
});
