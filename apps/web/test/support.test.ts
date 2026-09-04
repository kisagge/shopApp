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
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: unknown) => fn,
  TAG: { support: 'support' },
  TTL: { support: 300 },
}));

const { getFaq, getNotices, getAdminSupportPosts } = await import('~/lib/queries/support');
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
        kind: 'NOTICE', title: '제목', body: '본문',
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
});

describe('게시일', () => {
  const input = {
    kind: 'NOTICE' as const, title: '제목', body: '본문',
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
