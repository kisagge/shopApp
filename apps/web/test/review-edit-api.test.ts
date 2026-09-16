import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 리뷰 수정 창구.
 *
 * 사진이 오가는 자리라 **자격을 먼저 보고 그다음에 올린다.** 순서가 반대면 남의 리뷰 id 를 적어 파일만 올리는 길이 열린다.
 */

const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser, getActor }));

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const revalidateReviews = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateReviews }));

const assertCanEditReview = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const updateReview = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const deleteReview = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/reviews/write-review', async () => {
  const { REVIEW_ERROR_MESSAGE } = await import('@shop/core');
  class ReviewError extends Error {
    constructor(readonly code: keyof typeof REVIEW_ERROR_MESSAGE, readonly status = 400) {
      super(REVIEW_ERROR_MESSAGE[code]);
    }
  }
  return { assertCanEditReview, updateReview, deleteReview, ReviewError };
});

const uploadReviewImages = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const discardReviewImages = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/reviews/images', () => ({ uploadReviewImages, discardReviewImages }));

vi.mock('~/lib/reviews/report', () => ({ closeReportsAsRemoved: vi.fn() }));
vi.mock('~/lib/audit', () => ({ recordAudit: vi.fn() }));

const { PATCH } = await import('~/app/api/reviews/[id]/route');

const USER = { id: 'u-buyer' };
const body = { rating: 4, content: '다시 읽어 보니 기장이 조금 깁니다.' };

const call = (input: unknown = body, id = 'r-1') =>
  PATCH(
    new Request(`http://localhost/api/reviews/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }),
    { params: Promise.resolve({ id }) },
  );

/** 사진까지 함께 보내는 요청 */
const callWithPhoto = (input: unknown = body, id = 'r-1') => {
  const form = new FormData();
  form.set('data', JSON.stringify(input));
  form.append('images', new File([new Uint8Array([1, 2, 3])], 'p.webp', { type: 'image/webp' }));
  return PATCH(
    new Request(`http://localhost/api/reviews/${id}`, { method: 'PATCH', body: form }),
    { params: Promise.resolve({ id }) },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue(USER);
  enforceRateLimit.mockResolvedValue(null);
  assertCanEditReview.mockResolvedValue({ id: 'r-1', orderItemId: 'oi-1', images: [] });
  updateReview.mockResolvedValue({ id: 'r-1', rating: 4 });
  uploadReviewImages.mockResolvedValue([{ url: 'https://cdn/p.webp', key: 'k-1', blurDataUrl: null }]);
});

describe('PATCH /api/reviews/[id]', () => {
  it('로그인하지 않았으면 401', async () => {
    getSessionUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(updateReview).not.toHaveBeenCalled();
  });

  it('고친 내용을 저장하고 손님 화면 캐시를 턴다', async () => {
    expect((await call()).status).toBe(200);
    expect(updateReview).toHaveBeenCalledWith(USER.id, 'r-1', expect.objectContaining(body), []);
    expect(revalidateReviews).toHaveBeenCalled();
  });

  it('말이 안 되는 값은 칸 이름과 함께 거절한다', async () => {
    const response = await call({ rating: 9, content: '짧다' });
    expect(response.status).toBe(400);
    const failed = (await response.json()) as { fields: Record<string, string> };
    expect(Object.keys(failed.fields).sort()).toEqual(['content', 'rating']);
    expect(updateReview).not.toHaveBeenCalled();
  });

  it('남의 리뷰는 403 — 창구가 그 판단을 대신하지 않는다', async () => {
    const { ReviewError } = await import('~/lib/reviews/write-review');
    updateReview.mockRejectedValue(new ReviewError('NOT_OWN_REVIEW', 403));
    expect((await call()).status).toBe(403);
  });

  it('사진이 오면 자격을 먼저 보고 그다음에 올린다', async () => {
    await callWithPhoto();
    expect(assertCanEditReview).toHaveBeenCalledWith(USER.id, 'r-1');
    // 올린 자리는 그 리뷰가 달린 구매다 — 창구가 주소 조각을 그대로 믿지 않는다
    expect(uploadReviewImages.mock.calls[0]![0]).toBe('oi-1');
  });

  it('고치지 못했으면 올린 사진도 되돌린다', async () => {
    const { ReviewError } = await import('~/lib/reviews/write-review');
    updateReview.mockRejectedValue(new ReviewError('REVIEW_NOT_FOUND', 404));

    expect((await callWithPhoto()).status).toBe(404);
    expect(discardReviewImages).toHaveBeenCalledWith(['k-1']);
  });

  it('제한에 걸리면 아무 일도 하지 않는다', async () => {
    // 사진을 올리는 자리다 — 본문을 읽기 전에 막아야 파싱 비용을 우리가 내지 않는다
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(updateReview).not.toHaveBeenCalled();
  });
});
