import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 리뷰 판매자 답글 — 저장·알림·범위, 그리고 창구(감사 로그·캐시).
 */

const db = vi.hoisted(() => ({
  review: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const recordNotification = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/record', () => ({ recordNotification }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const revalidateReviews = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateReviews }));

const { replyToReview, deleteReviewReply } = await import('~/lib/reviews/reply');
const { PUT, DELETE } = await import('~/app/api/admin/reviews/[id]/reply/route');

const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const otherMerchant: Actor = { id: 'u-x', role: 'MERCHANT', merchantId: 'm-x' };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

const NOW = new Date('2026-09-15T05:00:00Z');
const review = (over: Record<string, unknown> = {}) => ({
  id: 'r-1', userId: 'u-buyer', deletedAt: null, reply: null, repliedAt: null, replyEditedAt: null,
  product: { name: '레더 카드 지갑', slug: 'leather-card-wallet', brand: { merchantId: 'm-a' } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.review.findUnique.mockResolvedValue(review());
  getActor.mockResolvedValue(merchant);
});

describe('답글 쓰기', () => {
  it('처음 답하면 시각을 찍고 쓴 사람에게 알린다', async () => {
    const { before, after } = await replyToReview(merchant, 'r-1', '감사합니다', NOW);

    expect(db.review.update).toHaveBeenCalledWith({
      where: { id: 'r-1' },
      data: { reply: '감사합니다', repliedAt: NOW, replyEditedAt: null, repliedById: 'u-m' },
    });
    expect(before.reply).toBeNull();
    expect(after).toEqual({ reply: '감사합니다', repliedAt: NOW, replyEditedAt: null });
    expect(recordNotification).toHaveBeenCalledWith({
      userId: 'u-buyer', kind: 'REVIEW_REPLIED', params: { productName: '레더 카드 지갑' }, linkPath: '/product/leather-card-wallet',
    });
  });

  it('고치면 처음 시각은 두고 고친 시각을 찍으며, 다시 알리지 않는다', async () => {
    const first = new Date('2026-09-10T00:00:00Z');
    db.review.findUnique.mockResolvedValue(review({ reply: '옛 답', repliedAt: first }));
    const { after } = await replyToReview(merchant, 'r-1', '고친 답', NOW);
    expect(after).toEqual({ reply: '고친 답', repliedAt: first, replyEditedAt: NOW });
    expect(recordNotification).not.toHaveBeenCalled();
  });

  it('남의 가맹점 리뷰는 없는 리뷰로 답한다 — 있는지조차 새지 않게', async () => {
    await expect(replyToReview(otherMerchant, 'r-1', '답', NOW)).rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND', status: 404 });
    db.review.findUnique.mockResolvedValue(null);
    await expect(replyToReview(admin, 'r-x', '답', NOW)).rejects.toMatchObject({ status: 404 });
    expect(db.review.update).not.toHaveBeenCalled();
  });

  it('운영진은 자사 브랜드 리뷰에도 답하고, 내려진 리뷰에는 누구도 못 단다', async () => {
    db.review.findUnique.mockResolvedValue(review({ product: { name: 'x', slug: 'x', brand: { merchantId: null } } }));
    await expect(replyToReview(admin, 'r-1', '답', NOW)).resolves.toBeTruthy();
    await expect(replyToReview(merchant, 'r-1', '답', NOW)).rejects.toMatchObject({ status: 404 });

    db.review.findUnique.mockResolvedValue(review({ deletedAt: new Date() }));
    await expect(replyToReview(admin, 'r-1', '답', NOW)).rejects.toMatchObject({ code: 'NOT_ALLOWED', status: 409 });
  });

  it('지우면 답만 걷고, 답이 없으면 거절한다', async () => {
    db.review.findUnique.mockResolvedValue(review({ reply: '답', repliedAt: NOW }));
    await deleteReviewReply(merchant, 'r-1');
    expect(db.review.update).toHaveBeenCalledWith({
      where: { id: 'r-1' }, data: { reply: null, repliedAt: null, replyEditedAt: null, repliedById: null },
    });
    db.review.findUnique.mockResolvedValue(review());
    await expect(deleteReviewReply(merchant, 'r-1')).rejects.toMatchObject({ code: 'NO_REPLY' });
  });
});

describe('답글 창구', () => {
  const put = (body: unknown) =>
    PUT(new Request('http://localhost/api/admin/reviews/r-1/reply', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'r-1' }) });

  it('저장하면 리뷰 캐시를 털고 전후를 감사 로그에 남긴다', async () => {
    const response = await put({ reply: '  감사합니다  ' });
    expect(response.status).toBe(200);
    expect(db.review.update.mock.calls[0]![0].data.reply).toBe('감사합니다');
    expect(revalidateReviews).toHaveBeenCalled();
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'review.reply', targetType: 'review', targetId: 'r-1', after: { reply: '감사합니다' } });
  });

  it('빈 답글은 칸 문구로 막고, 남의 리뷰는 404, 로그인 없으면 401 — 어느 쪽도 기록하지 않는다', async () => {
    const empty = await put({ reply: '   ' });
    expect(empty.status).toBe(400);
    getActor.mockResolvedValue(otherMerchant);
    expect((await put({ reply: '답' })).status).toBe(404);
    getActor.mockResolvedValue(null);
    expect((await put({ reply: '답' })).status).toBe(401);
    expect(recordAudit).not.toHaveBeenCalled();
    expect(revalidateReviews).not.toHaveBeenCalled();
  });

  it('지우기도 캐시를 털고 무엇을 지웠는지 남긴다', async () => {
    db.review.findUnique.mockResolvedValue(review({ reply: '옛 답', repliedAt: NOW }));
    const response = await DELETE(new Request('http://localhost/api/admin/reviews/r-1/reply', { method: 'DELETE' }), { params: Promise.resolve({ id: 'r-1' }) });
    expect(response.status).toBe(200);
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({ action: 'review.reply.delete', before: { reply: '옛 답' } });
    expect(revalidateReviews).toHaveBeenCalled();
  });
});
