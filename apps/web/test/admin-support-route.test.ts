import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 고칠 글 한 건을 주는 창구.
 *
 * **운영 목록이 본문을 안 들고 오기 때문에 이 창구가 생겼다.** 글마다 서식 나무를 화면으로
 * 내려보내면 응답이 글 수만큼 자라는데, 본문이 필요한 때는 고칠 한 건뿐이다.
 *
 * 받아 오지 못하는 길이 화면에서 **빈 폼**이 되면 안 된다 — 그것을 저장하는 순간 본문이
 * 날아간다. 그래서 거절도 404 도 분명하게 돌려줘야 한다.
 */

const session = await vi.hoisted(async () => (await import('./support/session-mock')).sessionMock());
vi.mock('@shop/auth/session', () => session);
const getActor = session.getActor;

const getAdminSupportPost = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const updateSupportPost = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const deleteSupportPost = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/support', () => ({ getAdminSupportPost }));
vi.mock('~/lib/admin/manage-support', () => ({ updateSupportPost, deleteSupportPost }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { GET } = await import('~/app/api/admin/support/[id]/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };

const call = (id = 'p-1') =>
  GET(new Request(`http://localhost/api/admin/support/${id}`), { params: Promise.resolve({ id }) });

const post = {
  id: 'p-1', kind: 'NOTICE', title: '추석 배송 안내', body: '본문', bodyRich: null,
  topic: null, pinned: false, sortOrder: 0, publishedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  getAdminSupportPost.mockResolvedValue(post);
});

describe('고칠 글 한 건', () => {
  it('본문까지 돌려준다', async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ post });
  });

  it('누가 물었는지를 조회에 넘긴다 — 권한은 거기서 본다', async () => {
    await call('p-7');
    expect(getAdminSupportPost).toHaveBeenCalledWith(admin, 'p-7');
  });

  it('로그인하지 않았으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(getAdminSupportPost).not.toHaveBeenCalled();
  });

  it('가맹점은 못 본다 — 고객센터의 글은 가게 전체의 말이다', async () => {
    getActor.mockResolvedValue(merchant);
    expect((await call()).status).toBe(403);
    expect(getAdminSupportPost).not.toHaveBeenCalled();
  });

  it('없는 글이면 404 — 화면이 빈 폼을 열지 않게 분명히 거절한다', async () => {
    getAdminSupportPost.mockResolvedValue(null);
    const response = await call();

    expect(response.status).toBe(404);
    expect((await response.json()).message).toBeTruthy();
  });
});
