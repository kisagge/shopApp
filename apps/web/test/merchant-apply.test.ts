import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { applyMerchantSchema } from '@shop/contract';

const tx = vi.hoisted(() => ({
  user: { update: vi.fn<(...a: any[]) => any>() },
  brand: { create: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  merchant: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    findUnique: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
  },
  brand: { findUnique: vi.fn<(...a: any[]) => any>() },
  user: { findFirst: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { applyForMerchant, activateApprovedMerchant, MerchantApplicationError } =
  await import('~/lib/merchant/apply');

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const merchant: Actor = { id: 'u-2', role: 'MERCHANT', merchantId: 'm-1' };
const admin: Actor = { id: 'u-3', role: 'ADMIN', merchantId: null };

const input = applyMerchantSchema.parse({
  name: '무어', brandName: 'MOOR', businessName: '무어상사',
  businessNumber: '1234567890', representative: '홍길동',
  contactEmail: 'a@b.test', contactPhone: '010-1111-2222',
});

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findFirst.mockResolvedValue(null);
  db.merchant.findUnique.mockResolvedValue(null);
  db.brand.findUnique.mockResolvedValue(null);
  db.merchant.create.mockResolvedValue({ id: 'm-new', name: '무어', status: 'PENDING' });
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
});

describe('누가 신청할 수 있는가', () => {
  it('고객은 신청할 수 있다', async () => {
    await expect(applyForMerchant(customer, input)).resolves.toMatchObject({ id: 'm-new' });
  });

  it('이미 가맹점이면 거절한다', async () => {
    await expect(applyForMerchant(merchant, input)).rejects.toMatchObject({
      code: 'ALREADY_MERCHANT',
    });
  });

  it('운영진은 신청할 수 없다 — 심사하는 사람과 받는 사람이 같아진다', async () => {
    await expect(applyForMerchant(admin, input)).rejects.toMatchObject({
      code: 'NOT_APPLICABLE', status: 403,
    });
    expect(db.merchant.create).not.toHaveBeenCalled();
  });
});

describe('신청', () => {
  it('심사 대기로 만들고 신청자를 남긴다', async () => {
    await applyForMerchant(customer, input);

    const data = db.merchant.create.mock.calls[0]![0].data;
    expect(data.status).toBe('PENDING');
    expect(data.applicantId).toBe('u-1');
    expect(data.brandName).toBe('MOOR');
  });

  it('승인 전에는 users 에 넣지 않는다', async () => {
    // 넣는 순간 아직 심사 중인 사람에게 가맹점 범위가 생긴다
    await applyForMerchant(customer, input);
    expect(db.merchant.create.mock.calls[0]![0].data).not.toHaveProperty('users');
  });

  it('심사 중인 신청이 있으면 막는다', async () => {
    db.merchant.findFirst.mockResolvedValue({ id: 'm-old' });

    await expect(applyForMerchant(customer, input)).rejects.toMatchObject({
      code: 'ALREADY_APPLIED',
    });
  });

  it('해지된 신청은 다시 낼 수 있다 — 반려가 영구 거절이 되면 안 된다', async () => {
    await applyForMerchant(customer, input);

    // 막는 조회가 TERMINATED 를 보지 않아야 한다
    expect(db.merchant.findFirst.mock.calls[0]![0].where.status.in).toEqual([
      'PENDING', 'APPROVED', 'SUSPENDED',
    ]);
  });

  it('무엇이 겹쳤는지 구분해 말한다', async () => {
    db.merchant.findUnique.mockImplementation(({ where }: { where: Record<string, string> }) =>
      Promise.resolve(where['name'] ? { id: 'x' } : null));
    await expect(applyForMerchant(customer, input)).rejects.toMatchObject({ code: 'NAME_TAKEN' });

    vi.clearAllMocks();
    db.merchant.findFirst.mockResolvedValue(null);
    db.merchant.findUnique.mockImplementation(({ where }: { where: Record<string, string> }) =>
      Promise.resolve(where['businessNumber'] ? { id: 'x' } : null));
    db.brand.findUnique.mockResolvedValue(null);
    await expect(applyForMerchant(customer, input)).rejects.toMatchObject({
      code: 'BUSINESS_NUMBER_TAKEN',
    });
  });
});

describe('승인하면 계정과 브랜드가 생긴다', () => {
  const pending = {
    id: 'm-1', name: '무어', brandName: 'MOOR', applicantId: 'u-1',
    _count: { brands: 0 },
  };

  beforeEach(() => {
    db.merchant.findUnique.mockResolvedValue(pending);
    db.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', merchantId: null });
  });

  it('신청자를 가맹점 계정으로 올린다', async () => {
    await activateApprovedMerchant('m-1');

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { role: 'MERCHANT', merchantId: 'm-1' },
    });
  });

  it('신청서의 이름으로 브랜드를 만든다', async () => {
    await activateApprovedMerchant('m-1');

    expect(tx.brand.create.mock.calls[0]![0].data).toMatchObject({
      name: 'MOOR', slug: 'moor', merchantId: 'm-1',
    });
  });

  it('한글 브랜드는 가맹점 id 로 주소를 만든다', async () => {
    // 슬러그가 비면 주소를 만들 수 없다
    db.merchant.findUnique.mockResolvedValue({ ...pending, brandName: '스튜디오눈' });

    await activateApprovedMerchant('m-1');

    expect(tx.brand.create.mock.calls[0]![0].data.slug).toMatch(/^brand-/);
  });

  it('두 번 눌러도 같다', async () => {
    /*
     * 승인을 다시 누르면 같은 브랜드가 또 생기거나 계정이 다시 바뀌면 안 된다.
     */
    db.merchant.findUnique.mockResolvedValue({ ...pending, _count: { brands: 1 } });
    db.user.findFirst.mockResolvedValue({ id: 'u-1', role: 'MERCHANT', merchantId: 'm-1' });

    await activateApprovedMerchant('m-1');

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.brand.create).not.toHaveBeenCalled();
  });

  it('운영진이 직접 만든 가맹점은 건드리지 않는다', async () => {
    // 신청자가 없다. 계정을 올릴 대상도 없다.
    db.merchant.findUnique.mockResolvedValue({ ...pending, applicantId: null });

    await activateApprovedMerchant('m-1');

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('신청자가 탈퇴했으면 알린다', async () => {
    db.user.findFirst.mockResolvedValue(null);

    await expect(activateApprovedMerchant('m-1')).rejects.toBeInstanceOf(MerchantApplicationError);
  });

  it('계정과 브랜드가 한 트랜잭션에서 만들어진다', async () => {
    // 중간에 끊겨 브랜드만 생기면 주인 없는 브랜드가 남는다
    await activateApprovedMerchant('m-1');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
