import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError, type Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  supportPost: {
    findMany: vi.fn<(...a: any[]) => any>().mockResolvedValue([]),
    findFirst: vi.fn<(...a: any[]) => any>().mockResolvedValue(null),
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
vi.mock('~/lib/audit', () => ({ recordAudit: vi.fn(async () => {}) }));
// 캐시 감싸개는 요청 밖에서 돌지 않는다. 그대로 통과시킨다.
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const {
  getFaq, getNotices, getAdminSupportPosts, getAdminSupportPost,
} = await import('~/lib/queries/support');
const { createSupportPost, updateSupportPost } = await import('~/lib/admin/manage-support');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const faqRow = (topic: string, id: string, title = id) => ({
  id, title, body: '답', topic, pinned: false, publishedAt: new Date('2026-01-01'),
});

beforeEach(() => {
  db.supportPost.findMany.mockReset().mockResolvedValue([]);
  db.supportPost.findFirst.mockReset().mockResolvedValue(null);
  db.supportPost.create.mockReset().mockResolvedValue({
    id: 'p-1', kind: 'NOTICE', title: '제목', publishedAt: null,
  });
  db.supportPost.update.mockReset().mockResolvedValue({
    id: 'p-1', kind: 'NOTICE', title: '제목', publishedAt: null,
  });
});

/** 본문 나무 하나. 계약이 받는 가장 작은 모양이다. */
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
});

describe('손님에게 보이는 것', () => {
  it('내보내지 않은 글과 지운 글은 조회에서 빠진다', async () => {
    await getNotices();

    const where = db.supportPost.findMany.mock.calls[0]![0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.kind).toBe('NOTICE');
  });

  it('고정한 공지가 날짜보다 먼저다', async () => {
    // 고정을 날짜 뒤에 두면 고정해도 새 글에 밀린다
    await getNotices();

    const orderBy = db.supportPost.findMany.mock.calls[0]![0].orderBy;
    expect(orderBy[0]).toEqual({ pinned: 'desc' });
  });

  it('캐시를 지나온 날짜 문자열을 되살린다', async () => {
    /*
     * unstable_cache 는 Date 를 JSON 으로 굴려 문자열로 돌려준다. 화면이
     * toISOString 을 부르는 순간 터진다 — 홈에서 한 번 겪은 함정이다.
     */
    db.supportPost.findMany.mockResolvedValue([
      { ...faqRow('DELIVERY', 'n-1'), publishedAt: '2026-01-01T00:00:00.000Z' },
    ]);

    const [notice] = await getNotices();

    expect(notice!.publishedAt).toBeInstanceOf(Date);
  });

  it('FAQ 를 갈래로 묶는다', async () => {
    db.supportPost.findMany.mockResolvedValue([
      faqRow('DELIVERY', 'f-1'),
      faqRow('DELIVERY', 'f-2'),
      faqRow('PAYMENT', 'f-3'),
    ]);

    const groups = await getFaq();

    expect(groups.map((g) => g.topic)).toEqual(['DELIVERY', 'PAYMENT']);
    expect(groups[0]!.items).toHaveLength(2);
  });

  it('비어 있는 갈래는 묶음 자체가 나오지 않는다', async () => {
    // 제목만 있고 아래가 빈 묶음은 "아직 안 만들었습니다" 를 여섯 번 보여 준다
    db.supportPost.findMany.mockResolvedValue([faqRow('ETC', 'f-1')]);

    const groups = await getFaq();

    expect(groups).toHaveLength(1);
    expect(groups[0]!.topic).toBe('ETC');
  });
});

describe('운영진만 쓴다', () => {
  it('가맹점은 목록도 못 본다', async () => {
    // 고객센터의 글은 한 브랜드가 아니라 가게 전체의 말이다
    await expect(getAdminSupportPosts(merchant)).rejects.toThrow(ForbiddenError);
  });

  it('고객도 못 본다', async () => {
    await expect(getAdminSupportPosts(customer)).rejects.toThrow(ForbiddenError);
  });

  it('막힌 조회는 DB 를 건드리지 않는다', async () => {
    await expect(getAdminSupportPosts(customer)).rejects.toThrow();
    expect(db.supportPost.findMany).not.toHaveBeenCalled();
  });

  it('가맹점은 쓸 수도 없다', async () => {
    await expect(
      createSupportPost(merchant, {
        kind: 'NOTICE', title: '제목', bodyRich: doc('본문'),
        pinned: false, sortOrder: 0, published: true,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(db.supportPost.create).not.toHaveBeenCalled();
  });

  it('운영진의 목록에는 초안도 나온다 — 못 보면 고칠 수 없다', async () => {
    await getAdminSupportPosts(admin);

    const where = db.supportPost.findMany.mock.calls[0]![0].where;
    expect(where.publishedAt).toBeUndefined();
    expect(where.deletedAt).toBeNull();
  });

  it('한 건도 운영 권한을 요구하고, 막히면 DB 를 건드리지 않는다', async () => {
    await expect(getAdminSupportPost(merchant, 'p-1')).rejects.toThrow(ForbiddenError);
    await expect(getAdminSupportPost(customer, 'p-1')).rejects.toThrow(ForbiddenError);
    expect(db.supportPost.findFirst).not.toHaveBeenCalled();
  });
});

/**
 * **운영 목록이 본문을 들고 오지 않는다.**
 *
 * 전에는 글마다 `body` 와 `bodyRich` 를 함께 읽어 화면으로 내려보냈다. 목록이 그리는 것은
 * 갈래·제목·고정·상태뿐이고, 본문이 필요한 때는 고칠 한 건뿐인데 — 그 한 건을 위해 모든
 * 글의 서식 나무가 응답에 실렸고, 글이 쌓이는 만큼 **상한도 페이징도 없이** 자랐다.
 *
 * 손님 쪽 공지 목록은 진작 그 교훈을 적어 두었다("목록은 나무를 싣지 않는다 … 캐시 한 칸이
 * 글 수만큼 커진다"). 운영 목록만 비켜 가 있었다.
 */
describe('운영 목록과 한 건', () => {
  it('목록은 본문을 읽지 않는다', async () => {
    await getAdminSupportPosts(admin);

    const select = db.supportPost.findMany.mock.calls[0]![0].select;
    expect(select.body).toBeUndefined();
    expect(select.bodyRich).toBeUndefined();
    // 그리는 것은 다 읽는다
    for (const field of ['id', 'kind', 'title', 'topic', 'pinned', 'sortOrder', 'publishedAt', 'updatedAt']) {
      expect(select[field], field).toBe(true);
    }
  });

  it('목록에 상한을 두지 않는다 — 자리 순서를 손으로 매기는 화면이다', async () => {
    /*
     * 이웃이 안 보이면 `sortOrder` 를 정할 수 없어서 페이징을 안 쓴다. 본문을 안 읽으니
     * 전부 줘도 가볍다 — 본문을 다시 읽기 시작하면 그때 상한이 필요해진다.
     */
    await getAdminSupportPosts(admin);

    const args = db.supportPost.findMany.mock.calls[0]![0];
    expect(args).not.toHaveProperty('take');
    expect(args).not.toHaveProperty('skip');
  });

  it('한 건은 본문까지 읽는다', async () => {
    db.supportPost.findFirst.mockResolvedValue({
      id: 'p-1', kind: 'NOTICE', title: '제목', body: '본문', bodyRich: null,
      topic: null, pinned: false, sortOrder: 0, publishedAt: null,
    });

    const post = await getAdminSupportPost(admin, 'p-1');

    expect(db.supportPost.findFirst.mock.calls[0]![0].select.bodyRich).toBe(true);
    expect(post?.body).toBe('본문');
  });

  it('지운 글은 한 건으로도 안 열린다', async () => {
    // 목록에 없는 글의 주소를 들고 와도 열리지 않아야, 고칠 수 없는 것을 내밀지 않는다
    await getAdminSupportPost(admin, 'p-1');

    expect(db.supportPost.findFirst.mock.calls[0]![0].where).toEqual({ id: 'p-1', deletedAt: null });
  });

  it('없는 글이면 null 이다 — 창구가 404 로 옮긴다', async () => {
    expect(await getAdminSupportPost(admin, 'p-없음')).toBeNull();
  });
});

describe('게시일', () => {
  const input = {
    kind: 'NOTICE' as const, title: '제목', bodyRich: doc('본문'),
    pinned: false, sortOrder: 0, published: true,
  };

  it('내보내지 않으면 게시일이 없다', async () => {
    await createSupportPost(admin, { ...input, published: false });
    expect(db.supportPost.create.mock.calls[0]![0].data.publishedAt).toBeNull();
  });

  it('내보내면 그때 찍는다', async () => {
    await createSupportPost(admin, input);
    expect(db.supportPost.create.mock.calls[0]![0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('이미 내보낸 글을 고쳐도 게시일을 다시 찍지 않는다', async () => {
    /*
     * 오타 하나 고쳤다고 공지가 목록 맨 위로 다시 올라오면, 읽은 사람이
     * 새 공지인 줄 안다.
     */
    const first = new Date('2026-01-01T00:00:00Z');
    db.supportPost.findFirst.mockResolvedValue({
      id: 'p-1', kind: 'NOTICE', title: '옛 제목', publishedAt: first,
    });

    await updateSupportPost(admin, 'p-1', { ...input, title: '고친 제목' });

    expect(db.supportPost.update.mock.calls[0]![0].data.publishedAt).toBe(first);
  });

  it('내렸다가 다시 내보내면 새로 찍는다', async () => {
    db.supportPost.findFirst.mockResolvedValue({
      id: 'p-1', kind: 'NOTICE', title: '제목', publishedAt: null,
    });

    await updateSupportPost(admin, 'p-1', input);

    expect(db.supportPost.update.mock.calls[0]![0].data.publishedAt).toBeInstanceOf(Date);
  });

  it('없는 글을 고치면 null 을 준다', async () => {
    db.supportPost.findFirst.mockResolvedValue(null);
    expect(await updateSupportPost(admin, 'nope', input)).toBeNull();
    expect(db.supportPost.update).not.toHaveBeenCalled();
  });
});
