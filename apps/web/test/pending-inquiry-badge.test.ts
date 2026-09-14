import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 사이드바의 답변 대기 문의 뱃지.
 *
 * **문의 화면의 "답변 대기" 와 같은 수여야 한다.** 따로 세면 뱃지는 3 인데 들어가 보면 2 건인 날이 오고,
 * 그러면 뱃지를 믿지 않게 된다. 그래서 두 곳이 넘기는 조건을 맞대 본다.
 */

const db = vi.hoisted(() => ({
  inquiry: { count: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { countPendingInquiries, getAdminInquiries } = await import('~/lib/queries/inquiries');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.inquiry.count.mockResolvedValue(3);
  db.inquiry.findMany.mockResolvedValue([]);
});

describe('답변 대기 문의 뱃지', () => {
  it.each([['운영진', admin], ['가맹점', merchant]] as const)('%s — 문의 화면의 답변 대기와 같은 조건으로 센다', async (_, actor) => {
    await getAdminInquiries(actor, { unanswered: true });
    const pageWhere = db.inquiry.count.mock.calls[0]![0].where;

    db.inquiry.count.mockClear();
    expect(await countPendingInquiries(actor)).toBe(3);
    expect(db.inquiry.count.mock.calls[0]![0].where).toEqual(pageWhere);
  });

  it('가맹점은 자기 상품의 문의만 센다 — 고객센터 문의는 플랫폼 몫이다', async () => {
    await countPendingInquiries(merchant);
    expect(db.inquiry.count.mock.calls[0]![0].where).toEqual({
      deletedAt: null, answeredAt: null, product: { brand: { merchantId: 'm-a' } },
    });
  });

  it('답할 권한이 없으면 세지도 않는다', async () => {
    expect(await countPendingInquiries(customer)).toBe(0);
    expect(db.inquiry.count).not.toHaveBeenCalled();
  });
});
