import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn<(...a: any[]) => any>() },
  product: { count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getMerchantDetail } = await import('~/lib/queries/admin/merchants');

/**
 * 가맹점 하나를 자세히.
 *
 * **목록 한 줄에 다 담을 수 없는 것들이 있었다.** 그중 하나가 반려 사유다 — 신청한
 * 사람은 신청 화면에서 보는데 정작 반려한 운영진은 감사 로그를 뒤져야 했다.
 */

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'm-a', name: '무어', status: 'APPROVED',
  businessName: '무어컴퍼니', businessNumber: '000-00-00012', representative: '홍길동',
  contactEmail: 'contact@moor.test', contactPhone: '02-0000-0003', commissionPercent: 15,
  approvedAt: new Date('2026-01-15'), createdAt: new Date('2025-08-31'),
  rejectionReason: null, suspendedReason: null, brandName: null,
  applicant: null,
  brands: [{ name: 'MOOR' }],
  users: [{ id: 'u-a', name: '무어운영', email: 'contact@moor.test' }],
  returnAddress: { id: 'ra-1' },
  settlementBank: 'KB', settlementAccount: '1234', settlementHolder: '무어컴퍼니',
  _count: { users: 1, settlements: 2 },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findUnique.mockResolvedValue(raw());
  db.product.count.mockResolvedValue(12);
});

describe('누가 볼 수 있는가', () => {
  it('고객은 볼 수 없다', async () => {
    await expect(getMerchantDetail(customer, 'm-a')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('가맹점은 자기 것을 본다', async () => {
    await expect(getMerchantDetail(merchantA, 'm-a')).resolves.toMatchObject({ id: 'm-a' });
  });

  it('남의 가맹점은 없는 것으로 답한다 — 있는지조차 새지 않게', async () => {
    /*
     * 권한 오류로 답하면 "그 id 는 있다" 를 알려 주는 셈이다. 설정 화면과 같은 규칙.
     */
    await expect(getMerchantDetail(merchantA, 'm-b')).resolves.toBeNull();
    expect(db.merchant.findUnique, '남의 것을 읽어 보지도 않는다').not.toHaveBeenCalled();
  });

  it('없는 가맹점도 null 이다', async () => {
    db.merchant.findUnique.mockResolvedValue(null);
    await expect(getMerchantDetail(superAdmin, 'm-x')).resolves.toBeNull();
  });
});

describe('무엇을 담는가', () => {
  it('반려 사유를 싣는다 — 목록에는 자리가 없었다', async () => {
    db.merchant.findUnique.mockResolvedValue(
      raw({ status: 'REJECTED', rejectionReason: '브랜드 서류가 없습니다' }),
    );

    const detail = await getMerchantDetail(superAdmin, 'm-a');

    expect(detail?.rejectionReason).toBe('브랜드 서류가 없습니다');
  });

  it('정지·해지 사유도 싣는다 — 처분한 쪽에는 볼 자리가 없었다', async () => {
    db.merchant.findUnique.mockResolvedValue(
      raw({ status: 'SUSPENDED', suspendedReason: '정산 계좌 확인이 필요합니다' }),
    );

    const detail = await getMerchantDetail(superAdmin, 'm-a');

    expect(detail?.suspendedReason).toBe('정산 계좌 확인이 필요합니다');
    // 반려 칸과 섞이지 않는다 — 반려는 못 들어온 것이고 정지는 멈춘 것이다
    expect(detail?.rejectionReason).toBeNull();
  });

  it('사업자번호는 뒤 두 자리를 가린다 — 목록과 같은 규칙이다', async () => {
    // 대조에는 쓰되 그대로 흘리지는 않는다
    const detail = await getMerchantDetail(superAdmin, 'm-a');
    expect(detail?.businessNumber).toBe('000-00-000**');
  });

  it('보관한 상품은 세지 않는다', async () => {
    await getMerchantDetail(superAdmin, 'm-a');

    expect(db.product.count.mock.calls[0]![0].where).toMatchObject({
      brand: { merchantId: 'm-a' },
      deletedAt: null,
    });
  });

  it('지급을 기다리는 정산만 센다 — 계좌가 없으면 이것들이 묶인다', async () => {
    await getMerchantDetail(superAdmin, 'm-a');

    const counted = db.merchant.findUnique.mock.calls[0]![0].select._count.select.settlements;
    expect(counted.where).toEqual({ status: 'CONFIRMED' });
  });

  it('반품지·정산 계좌가 있는지 말한다', async () => {
    const detail = await getMerchantDetail(superAdmin, 'm-a');
    expect(detail?.hasReturnAddress).toBe(true);
    expect(detail?.hasSettlementAccount).toBe(true);
  });

  it('반품지가 없으면 없다고 말한다', async () => {
    db.merchant.findUnique.mockResolvedValue(raw({ returnAddress: null }));
    const detail = await getMerchantDetail(superAdmin, 'm-a');
    expect(detail?.hasReturnAddress).toBe(false);
  });
});
