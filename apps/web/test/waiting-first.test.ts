import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * **처리할 일은 오래 기다린 것부터.**
 *
 * 이 규칙은 한 화면에서 시작해 다섯 곳으로 퍼졌는데, 퍼지는 동안 **각자 적혔다.** 그래서 어긋나기도
 * 했다 — 주문 목록은 모든 탭이 최신순이었고(가장 오래 기다린 사람이 가장 뒤에 섰다), 리뷰 신고
 * 대기줄은 "새 신고가 앞을 막으면 안 된다" 고 적어 두고 그 위에서 **최신순으로 잘라** 오래된 신고를
 * 통째로 버렸다.
 *
 * 규칙 자체는 조회마다 다른 칸을 본다(접수 시각·신청 시각·작성 시각·검수 요청 시각). 그래서 한
 * 함수로 묶을 수가 없다 — 대신 **한 자리에서 다 같이 맞춰 본다.** 새 대기줄이 생겼을 때 이 표에
 * 줄을 더하면서 "우리는 어느 쪽인가" 를 묻게 되는 것이 이 검사의 값이다.
 *
 * **끝난 목록은 반대다.** 거기서는 방금 일어난 일이 위에 와야 하고, 그 줄들은 누가 처리하기를
 * 기다리고 있지 않다 — 그쪽도 함께 못 박는다. 어느 쪽인지 모르고 베끼면 둘 다 틀린다.
 */

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  returnRequest: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  inquiry: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  product: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  category: { findMany: vi.fn<(...a: any[]) => any>() },
  review: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  user: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const { getAdminOrders } = await import('~/lib/queries/admin/orders');
const { getReturnQueue } = await import('~/lib/queries/admin/returns');
const { getAdminInquiries } = await import('~/lib/queries/inquiries');
const { getAdminProducts } = await import('~/lib/queries/admin/products');
const { getAdminReviews } = await import('~/lib/queries/admin-reviews');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of [db.order, db.returnRequest, db.inquiry, db.product, db.review]) {
    model.findMany.mockResolvedValue([]);
    model.count.mockResolvedValue(0);
  }
  db.category.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

/** 첫 정렬 칸의 방향 — 배열로 적든 하나로 적든 같은 자리를 본다 */
const direction = (model: { findMany: { mock: { calls: unknown[][] } } }): string => {
  const { orderBy } = model.findMany.mock.calls[0]![0] as { orderBy: unknown };
  const first = Array.isArray(orderBy) ? orderBy[0] : orderBy;
  return Object.values(first as Record<string, string>)[0]!;
};

describe('처리할 일은 오래 기다린 것부터', () => {
  it.each([
    [
      '주문 — 아직 내보내지 않은 탭',
      async () => { await getAdminOrders(admin, { status: 'PREPARING' }); },
      () => direction(db.order),
    ],
    [
      '반품·교환 — 처리 대기',
      async () => { await getReturnQueue(admin, { view: 'OPEN' }); },
      () => direction(db.returnRequest),
    ],
    [
      '문의 — 답변 대기',
      async () => { await getAdminInquiries(admin, { unanswered: true }); },
      () => direction(db.inquiry),
    ],
    [
      '상품 — 검수 대기',
      async () => { await getAdminProducts(admin, { status: 'PENDING_REVIEW' }); },
      () => direction(db.product),
    ],
    [
      '리뷰 신고 — 대기줄(상한에 걸리면 오래된 쪽을 남긴다)',
      async () => { await getAdminReviews(admin, { tab: 'reported' }); },
      () => direction(db.review),
    ],
  ])('%s', async (_label, call, got) => {
    await call();
    expect(got()).toBe('asc');
  });

  /** 거기서는 방금 일어난 일이 위에 와야 한다 — 그 줄들은 누가 처리하기를 기다리지 않는다 */
  it.each([
    [
      '주문 — 보낸 뒤',
      async () => { await getAdminOrders(admin, { status: 'DELIVERED' }); },
      () => direction(db.order),
    ],
    [
      '주문 — 전체(할 일 목록이 아니라 장부다)',
      async () => { await getAdminOrders(admin, {}); },
      () => direction(db.order),
    ],
    [
      '반품·교환 — 끝난 것',
      async () => { await getReturnQueue(admin, { view: 'DONE' }); },
      () => direction(db.returnRequest),
    ],
    [
      '문의 — 전체',
      async () => { await getAdminInquiries(admin, {}); },
      () => direction(db.inquiry),
    ],
    [
      '상품 — 검수 대기가 아닌 탭',
      async () => { await getAdminProducts(admin, {}); },
      () => direction(db.product),
    ],
  ])('%s 는 최신순', async (_label, call, got) => {
    await call();
    expect(got()).toBe('desc');
  });
});
