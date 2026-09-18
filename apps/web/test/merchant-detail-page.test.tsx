// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getMerchantDetail = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/merchants', () => ({ getMerchantDetail }));
const getAuditLogs = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/audit-log', () => ({ getAuditLogs }));
const notFound = vi.hoisted(() => vi.fn<(...a: any[]) => any>(() => { throw new Error('NOT_FOUND'); }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@shop/db', () => ({ prisma: {} }));

const Page = (await import('~/app/admin/merchants/[id]/page')).default;

/**
 * 가맹점 상세 화면.
 *
 * **반려 사유는 여기 말고 볼 자리가 없었다.** 신청한 사람은 신청 화면에서 보는데
 * 반려한 운영진은 감사 로그를 뒤져야 했다.
 */

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };

const detail = (over: Record<string, unknown> = {}) => ({
  id: 'm-a', name: '무어', status: 'APPROVED',
  businessName: '무어컴퍼니', businessNumber: '000-00-000**', representative: '홍길동',
  contactEmail: 'contact@moor.test', contactPhone: '02-0000-0003', commissionPercent: 15,
  brandNames: ['MOOR'], appliedBrandName: null, applicant: null,
  userCount: 1, approvedAt: new Date('2026-01-15'), createdAt: new Date('2025-08-31'),
  hasReturnAddress: true, hasSettlementAccount: true,
  rejectionReason: null, suspendedReason: null, productCount: 12, settlementCount: 2,
  staff: [{ id: 'u-a', name: '무어운영', email: 'contact@moor.test' }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(superAdmin);
  getMerchantDetail.mockResolvedValue(detail());
  getAuditLogs.mockResolvedValue({ rows: [] });
});

const renderPage = async () => render(await Page({ params: Promise.resolve({ id: 'm-a' }) }));

describe('정지·해지 사유', () => {
  it('정지됐으면 사유를 보여 준다 — 다시 열어 줄지 판단할 때 가장 먼저 묻는 것이다', async () => {
    getMerchantDetail.mockResolvedValue(
      detail({ status: 'SUSPENDED', suspendedReason: '정산 계좌 명의가 다릅니다' }),
    );

    await renderPage();

    expect(screen.getByText('정지 사유')).toBeInTheDocument();
    expect(screen.getByText('정산 계좌 명의가 다릅니다')).toBeInTheDocument();
  });

  it('해지에는 해지라고 적는다 — 정지와 다른 일이다', async () => {
    getMerchantDetail.mockResolvedValue(
      detail({ status: 'TERMINATED', suspendedReason: '계약이 끝났습니다' }),
    );

    await renderPage();

    expect(screen.getByText('해지 사유')).toBeInTheDocument();
    expect(screen.queryByText('정지 사유')).toBeNull();
  });

  it('멀쩡한 가맹점에는 그 줄이 없다', async () => {
    await renderPage();
    expect(screen.queryByText(/정지 사유|해지 사유/)).toBeNull();
  });
});

describe('반려 사유', () => {
  it('반려됐으면 사유를 보여 준다', async () => {
    getMerchantDetail.mockResolvedValue(
      detail({ status: 'REJECTED', rejectionReason: '브랜드 서류가 없습니다' }),
    );

    await renderPage();

    expect(screen.getByText('반려 사유')).toBeInTheDocument();
    expect(screen.getByText('브랜드 서류가 없습니다')).toBeInTheDocument();
  });

  it('반려가 아니면 그 줄을 그리지 않는다 — 빈 칸은 무엇이 없는지도 말하지 않는다', async () => {
    await renderPage();
    expect(screen.queryByText('반려 사유')).toBeNull();
  });
});

describe('지난 기록', () => {
  it('이 가맹점 것만 묻는다 — 종류로만 걸면 남의 기록이 섞인다', async () => {
    await renderPage();

    expect(getAuditLogs).toHaveBeenCalledWith(
      superAdmin,
      expect.objectContaining({ targetType: 'merchant', targetId: 'm-a' }),
    );
  });

  it('가맹점 계정에게는 묻지도 않는다 — 누가 정지했는지까지 보여 줄 이유가 없다', async () => {
    requireAdmin.mockResolvedValue(merchantA);

    await renderPage();

    expect(getAuditLogs).not.toHaveBeenCalled();
  });
});

describe('못 하는 일을 미리 말한다', () => {
  it('반품지가 없으면 반품을 승인할 수 없다고 적는다', async () => {
    // 그때 가서 막히는 것보다 여기서 보이는 편이 낫다
    getMerchantDetail.mockResolvedValue(detail({ hasReturnAddress: false }));

    await renderPage();

    expect(screen.getByRole('status').textContent).toMatch(/반품지가 없어/);
  });

  it('둘 다 있으면 아무 말도 하지 않는다', async () => {
    await renderPage();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('없는 가맹점', () => {
  it('없으면 없는 화면으로 답한다', async () => {
    getMerchantDetail.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow('NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
