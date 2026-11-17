import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 방침 읽기 — 지금 올라와 있는 것, 둘을 나란히, 그리고 지난 판 하나.
 *
 * 목록(`policy-revision-list`)과 창구(`policy-api`)에는 검사가 있는데 **읽는 자리
 * 자체가 비어 있었다.** 여기서 틀리면 약관 화면이 통째로 틀리고, 지난 판을
 * 여는 길은 **주소에 id 를 적어 들어온다** — 그 자리가 종류를 함께 보지 않으면
 * 다른 방침의 글이 열린다.
 */

const db = vi.hoisted(() => ({
  policy: { findUnique: vi.fn<(...a: any[]) => any>(), findMany: vi.fn<(...a: any[]) => any>() },
  policyRevision: { findFirst: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { JsonNull: 'JsonNull' } }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getPolicy, getPolicies, getPolicyRevision } = await import('~/lib/policies/policy');

const RICH = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '제1조' }] }] };

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'TERMS',
  title: '이용약관',
  body: '제1조 ...',
  bodyRich: RICH,
  effectiveAt: new Date('2026-03-01T00:00:00+09:00'),
  updatedAt: new Date('2026-02-20T05:00:00Z'),
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('지금 올라와 있는 방침', () => {
  it('찾는 종류 하나만 읽는다', async () => {
    db.policy.findUnique.mockResolvedValue(row());

    await getPolicy('TERMS');

    expect(db.policy.findUnique).toHaveBeenCalledWith({ where: { kind: 'TERMS' } });
  });

  it('아직 한 번도 쓰지 않았으면 null 이다 — 빈 문서를 만들어 내지 않는다', async () => {
    db.policy.findUnique.mockResolvedValue(null);

    expect(await getPolicy('PRIVACY')).toBeNull();
  });

  it('캐시를 지나와 날짜가 문자열이 되어도 Date 로 되살린다', async () => {
    /*
     * **공지에서 한 번 겪은 함정이다.** 캐시를 지나온 값은 직렬화를 거쳐 날짜가
     * 문자열로 돌아온다. 그대로 흘리면 화면이 `toLocaleString` 을 부르는 자리에서
     * 터지거나 — 더 조용하게 — 타입만 맞고 시행일이 엉뚱하게 찍힌다.
     */
    db.policy.findUnique.mockResolvedValue(
      row({ effectiveAt: '2026-03-01T00:00:00+09:00', updatedAt: '2026-02-20T05:00:00.000Z' }),
    );

    const doc = (await getPolicy('TERMS'))!;

    expect(doc.effectiveAt).toBeInstanceOf(Date);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.effectiveAt.toISOString()).toBe('2026-02-28T15:00:00.000Z');
  });

  it('읽은 글을 그대로 돌려준다', async () => {
    db.policy.findUnique.mockResolvedValue(row());

    const doc = (await getPolicy('TERMS'))!;

    expect(doc.kind).toBe('TERMS');
    expect(doc.title).toBe('이용약관');
    expect(doc.body).toBe('제1조 ...');
    expect(doc.bodyRich).toEqual(RICH);
  });

  it('서식 본문이 없으면 null 이다 — 없는 것과 모르는 것을 가르지 않는다', async () => {
    db.policy.findUnique.mockResolvedValue(row({ bodyRich: null }));

    expect((await getPolicy('TERMS'))!.bodyRich).toBeNull();
  });
});

describe('둘을 나란히', () => {
  it('종류 순으로 읽는다 — 운영 화면에서 자리가 흔들리지 않게', async () => {
    db.policy.findMany.mockResolvedValue([]);

    await getPolicies();

    expect(db.policy.findMany).toHaveBeenCalledWith({ orderBy: { kind: 'asc' } });
  });

  it('읽은 문서를 모두 돌려준다', async () => {
    db.policy.findMany.mockResolvedValue([row(), row({ kind: 'PRIVACY', title: '개인정보 처리방침' })]);

    const docs = await getPolicies();

    expect(docs.map((d) => d.kind)).toEqual(['TERMS', 'PRIVACY']);
    expect(docs[1]!.title).toBe('개인정보 처리방침');
  });

  it('아직 아무것도 없으면 빈 목록이다', async () => {
    db.policy.findMany.mockResolvedValue([]);

    expect(await getPolicies()).toEqual([]);
  });
});

describe('지난 방침 하나', () => {
  const revision = {
    id: 'rev-1',
    kind: 'TERMS',
    title: '이용약관',
    body: '제1조 ...',
    bodyRich: RICH,
    effectiveAt: new Date('2025-01-01T00:00:00+09:00'),
    replacedAt: new Date('2026-03-01T00:00:00+09:00'),
  };

  it('id 와 종류를 함께 본다 — 다른 방침의 id 를 주소에 넣어도 열리지 않는다', async () => {
    /*
     * 이 화면은 **주소에 적힌 id 로** 열린다(`?v=`). id 만 보고 찾으면 약관 화면에
     * 개인정보 처리방침의 글이 뜬다 — 머리말은 약관이라고 적힌 채로.
     */
    db.policyRevision.findFirst.mockResolvedValue(null);

    await getPolicyRevision('PRIVACY', 'rev-1');

    expect(db.policyRevision.findFirst.mock.calls[0]![0].where).toEqual({ id: 'rev-1', kind: 'PRIVACY' });
  });

  it('없으면 null 이다', async () => {
    db.policyRevision.findFirst.mockResolvedValue(null);

    expect(await getPolicyRevision('TERMS', 'rev-없음')).toBeNull();
  });

  it('전문을 함께 읽는다 — 이 화면은 그 글을 읽으러 온 자리다', async () => {
    /* 목록은 본문을 안 읽는다(판 수만큼 약관 전문을 끌어오지 않는다). 여기는 반대다 */
    db.policyRevision.findFirst.mockResolvedValue(revision);

    await getPolicyRevision('TERMS', 'rev-1');

    const select = db.policyRevision.findFirst.mock.calls[0]![0].select;
    expect(select.body).toBe(true);
    expect(select.bodyRich).toBe(true);
  });

  it('그 글과 효력 기간을 돌려준다', async () => {
    db.policyRevision.findFirst.mockResolvedValue(revision);

    const doc = (await getPolicyRevision('TERMS', 'rev-1'))!;

    expect(doc).toEqual({
      id: 'rev-1',
      kind: 'TERMS',
      title: '이용약관',
      body: '제1조 ...',
      bodyRich: RICH,
      effectiveAt: revision.effectiveAt,
      replacedAt: revision.replacedAt,
    });
  });

  it('서식 본문이 없으면 null 이다', async () => {
    db.policyRevision.findFirst.mockResolvedValue({ ...revision, bodyRich: null });

    expect((await getPolicyRevision('TERMS', 'rev-1'))!.bodyRich).toBeNull();
  });
});
