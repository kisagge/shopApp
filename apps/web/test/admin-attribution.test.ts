import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영 화면의 "누가 했는지" — 문의 답변, 리뷰 답글, 회원 목록의 정지.
 *
 * 셋 다 적어 두기만 하고 보여 주지 않던 칸이다. 말을 고르는 규칙은 core 가 본다(attribution).
 * 여기서는 조회가 그 말을 **보는 사람에 맞게** 만들어 싣는지, 사람을 **한 번에** 읽는지 본다.
 */

const db = vi.hoisted(() => ({
  inquiry: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  review: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
  user: { findMany: vi.fn<(...a: any[]) => any>(), count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminInquiries } = await import('~/lib/queries/inquiries');
const { getAdminReviews } = await import('~/lib/queries/admin-reviews');
const { getAdminUsers } = await import('~/lib/queries/admin/merchants');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };

const PEOPLE = [
  { id: 'u-park', name: '박운영', role: 'ADMIN', merchantId: null },
  { id: 'u-kim', name: '김담당', role: 'MERCHANT', merchantId: 'm-a' },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.inquiry.count.mockResolvedValue(1);
  db.review.count.mockResolvedValue(1);
  db.user.count.mockResolvedValue(1);
});

describe('문의 답변', () => {
  const inquiry = (over: Record<string, unknown> = {}) => ({
    id: 'q-1', content: '사이즈가 궁금합니다', isPrivate: false, createdAt: new Date('2026-09-01'),
    answer: '정사이즈입니다', answeredAt: new Date('2026-09-02'), answeredById: 'u-park',
    answeredBy: PEOPLE[0], topic: null,
    product: { id: 'p-1', name: '울 코트' }, author: { name: '홍길동' }, images: [],
    ...over,
  });

  it('답한 사람을 함께 읽는다 — 관계가 있어 한 번에 온다', async () => {
    db.inquiry.findMany.mockResolvedValue([inquiry()]);

    const { rows } = await getAdminInquiries(admin);

    expect(rows[0]!.answeredBy).toBe('박운영 · 관리자');
    expect(db.inquiry.findMany.mock.calls[0]![0].select.answeredBy).toEqual({
      select: { id: true, name: true, role: true, merchantId: true },
    });
  });

  it('가맹점이 보면 운영진의 이름은 나가지 않는다', async () => {
    db.inquiry.findMany.mockResolvedValue([inquiry()]);
    expect((await getAdminInquiries(merchant)).rows[0]!.answeredBy).toBe('운영진');
  });

  it('가맹점이 보면 같은 가게 동료는 이름으로', async () => {
    db.inquiry.findMany.mockResolvedValue([inquiry({ answeredById: 'u-kim', answeredBy: PEOPLE[1] })]);
    expect((await getAdminInquiries(merchant)).rows[0]!.answeredBy).toBe('김담당');
  });

  it('답이 없으면 비운다', async () => {
    db.inquiry.findMany.mockResolvedValue([inquiry({ answer: null, answeredAt: null, answeredById: null, answeredBy: null })]);
    expect((await getAdminInquiries(admin)).rows[0]!.answeredBy).toBeNull();
  });

  it('답한 사람이 적히기 전의 답이면 "기록 없음"', async () => {
    db.inquiry.findMany.mockResolvedValue([inquiry({ answeredById: null, answeredBy: null })]);
    expect((await getAdminInquiries(admin)).rows[0]!.answeredBy).toBe('기록 없음');
  });

  it('id 는 남았는데 사람을 못 읽으면 탈퇴한 계정이라고 말한다', async () => {
    /*
     * 탈퇴는 행을 남기므로(deletedAt) 보통은 이름이 그대로 읽힌다. 행이 정말 지워지면 관계가
     * SetNull 이라 id 까지 비어 위의 "기록 없음" 이 된다. 여기서 보는 것은 그 사이의 모양이다.
     */
    db.inquiry.findMany.mockResolvedValue([inquiry({ answeredById: 'u-gone', answeredBy: null })]);
    expect((await getAdminInquiries(admin)).rows[0]!.answeredBy).toBe('탈퇴한 계정');
  });
});

describe('리뷰 답글', () => {
  const review = (id: string, over: Record<string, unknown> = {}) => ({
    id, rating: 4, content: '좋아요', _count: { images: 0 },
    createdAt: new Date('2026-09-01'), deletedAt: null, productId: 'p-1',
    user: { name: '홍길동' },
    product: { name: '울 코트', brand: { merchantId: 'm-a' } },
    reply: '감사합니다', repliedAt: new Date('2026-09-02'), replyEditedAt: null, repliedById: 'u-kim',
    reports: [],
    ...over,
  });

  beforeEach(() => {
    db.user.findMany.mockImplementation(async ({ where }: any) =>
      PEOPLE.filter((p) => (where.id.in as string[]).includes(p.id)));
  });

  it('쪽에 나온 답글 단 사람을 한 번에 읽는다 — 줄마다 묻지 않는다', async () => {
    db.review.findMany.mockResolvedValue([
      review('r-1'),
      review('r-2', { repliedById: 'u-park' }),
      review('r-3'),
    ]);

    const { rows } = await getAdminReviews(admin, { tab: 'all' });

    expect(db.user.findMany).toHaveBeenCalledTimes(1);
    expect(db.user.findMany.mock.calls[0]![0].where.id.in.sort()).toEqual(['u-kim', 'u-park']);
    expect(rows.map((r) => r.repliedBy)).toEqual(['김담당 · 가맹점', '박운영 · 관리자', '김담당 · 가맹점']);
  });

  it('가맹점이 보면 운영진의 답글은 "운영진" 으로', async () => {
    db.review.findMany.mockResolvedValue([review('r-1', { repliedById: 'u-park' })]);
    expect((await getAdminReviews(merchant, { tab: 'all' })).rows[0]!.repliedBy).toBe('운영진');
  });

  it('답글이 없으면 비우고, 사람을 찾으러 가지도 않는다', async () => {
    db.review.findMany.mockResolvedValue([review('r-1', { reply: null, repliedAt: null, repliedById: null })]);

    const { rows } = await getAdminReviews(admin, { tab: 'all' });

    expect(rows[0]!.repliedBy).toBeNull();
    expect(db.user.findMany).not.toHaveBeenCalled();
  });

  it('신고 대기줄에서도 같은 말을 싣는다', async () => {
    db.review.findMany.mockResolvedValue([
      review('r-1', { reports: [{ id: 'rp-1', reason: 'SPAM', detail: null, createdAt: new Date(), resolvedAt: null, resolution: null, reporter: { name: '신고자' } }] }),
    ]);
    expect((await getAdminReviews(admin, { tab: 'reported' })).rows[0]!.repliedBy).toBe('김담당 · 가맹점');
  });

  it('답글 단 사람의 계정이 사라졌으면 그렇다고 말한다', async () => {
    db.review.findMany.mockResolvedValue([review('r-1', { repliedById: 'u-gone' })]);
    expect((await getAdminReviews(admin, { tab: 'all' })).rows[0]!.repliedBy).toBe('탈퇴한 계정');
  });
});

describe('회원 목록의 정지', () => {
  const member = (id: string, over: Record<string, unknown> = {}) => ({
    id, name: '홍손님', email: `${id}@plain.test`, role: 'CUSTOMER', createdAt: new Date('2026-01-01'),
    deletedAt: null, suspendedAt: null, suspendedReason: null, suspendedBy: null, pointBalance: 0,
    merchant: null, _count: { orders: 0 },
    ...over,
  });

  it('정지된 줄의 건 사람만 한 번에 읽는다', async () => {
    db.user.findMany.mockImplementation(async ({ where, select }: any) => {
      // 목록 조회와 사람 조회가 같은 표를 쓴다 — 고르는 칸으로 가른다
      if (select.email) {
        return [
          member('u-1', { suspendedAt: new Date('2026-09-05'), suspendedReason: '사기', suspendedBy: 'u-park' }),
          member('u-2'),
          // 풀린 뒤 남은 값은 보지 않는다(풀면 비우지만, 남았더라도)
          member('u-3', { suspendedBy: 'u-kim' }),
        ];
      }
      return PEOPLE.filter((p) => (where.id.in as string[]).includes(p.id));
    });

    const { rows } = await getAdminUsers(admin);

    expect(rows.map((r) => r.suspendedBy)).toEqual(['박운영 · 관리자', null, null]);
    const lookup = db.user.findMany.mock.calls.find((c) => !c[0].select.email)!;
    expect(lookup[0].where).toEqual({ id: { in: ['u-park'] } });
  });

  it('정지된 줄이 없으면 사람을 찾으러 가지 않는다', async () => {
    db.user.findMany.mockResolvedValue([member('u-1')]);

    await getAdminUsers(admin);

    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });
});
