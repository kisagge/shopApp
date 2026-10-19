import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 그 시각에 효력을 갖던 방침.
 *
 * 동의 기록은 **시각 하나**만 남긴다 — 사람마다 약관 한 벌을 안고 있게 하지 않으려는 선택이고,
 * core 의 `ConsentRecord` 가 그 대신 "무엇에 동의했는지는 그때 효력이 있던 방침이 말한다,
 * 시각 하나면 되짚을 수 있다" 고 적어 두었다. **그 되짚기를 하는 코드가 없었다.**
 *
 * 되짚는 규칙이 틀리기 쉬운 자리라 여기서 못 박는다.
 */

const db = vi.hoisted(() => ({
  policyRevision: { findFirst: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { JsonNull: 'JsonNull' } }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getPolicyInForceAt } = await import('~/lib/policies/policy');

const AGREED = new Date('2026-05-10T04:00:00Z');

const row = {
  id: 'rev-2',
  kind: 'TERMS' as const,
  title: '이용약관',
  body: '옛 내용',
  bodyRich: null,
  effectiveAt: new Date('2026-01-01T00:00:00Z'),
  replacedAt: new Date('2026-06-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  db.policyRevision.findFirst.mockResolvedValue(row);
});

describe('그 시각에 효력을 갖던 판', () => {
  it('동의한 뒤에 바뀐 판들 중 가장 먼저 바뀐 것을 집는다', async () => {
    await getPolicyInForceAt('TERMS', AGREED);

    const [args] = db.policyRevision.findFirst.mock.calls[0]!;
    expect(args.where).toEqual({ kind: 'TERMS', replacedAt: { gt: AGREED } });
    // 가장 이른 것이 답이다. desc 로 두면 **가장 최근** 판을 내주고, 그건 그때 것이 아니다.
    expect(args.orderBy).toEqual({ replacedAt: 'asc' });
  });

  it('시행일로 재지 않는다 — 앞날로 미리 올린 방침이 있다', async () => {
    /*
     * 새 방침은 "며칠 뒤부터 이렇게 바뀝니다" 로 미리 올릴 수 있고, 그동안 효력은 지난
     * 방침에 있다(core 의 `policyInEffect` 가 적어 둔 사정이다). 그래서 시행일로 맞추면
     * 아직 효력도 없던 문서를 "그때 동의한 것" 으로 내놓는다.
     */
    await getPolicyInForceAt('TERMS', AGREED);
    const [args] = db.policyRevision.findFirst.mock.calls[0]!;
    expect(JSON.stringify(args)).not.toContain('effectiveAt":{');
    expect(args.orderBy).not.toHaveProperty('effectiveAt');
  });

  it('다른 종류의 방침을 섞지 않는다', async () => {
    await getPolicyInForceAt('PRIVACY', AGREED);
    expect(db.policyRevision.findFirst.mock.calls[0]![0].where.kind).toBe('PRIVACY');
  });

  it('그 판의 내용을 그대로 돌려준다 — 화면이 주소에 쓸 id 가 거기 있다', async () => {
    const found = await getPolicyInForceAt('TERMS', AGREED);
    expect(found?.id).toBe('rev-2');
    expect(found?.replacedAt).toEqual(row.replacedAt);
  });

  it('그 뒤로 바뀐 적이 없으면 null — 지금 올라와 있는 것이 그때 것이다', async () => {
    // null 을 "못 찾았다" 로 읽으면 안 된다. 부르는 쪽은 이때 현재 방침으로 보낸다.
    db.policyRevision.findFirst.mockResolvedValue(null);
    expect(await getPolicyInForceAt('TERMS', AGREED)).toBeNull();
  });

  it('이미 불러 둔 목록에서 고르지 않는다 — 스무 개로 잘린 목록은 틀린 답을 준다', async () => {
    /*
     * `getPolicyRevisions` 는 최근 스무 개만 가져온다. 오래전에 동의한 사람을 그 목록에서
     * 찾으면 **목록에서 가장 오래된 판**이 답으로 나오는데, 그보다 더 오래된 판이 잘려
     * 나갔을 수 있다 — 틀린 답인데 그럴듯해 보인다. 색인이 있으니 직접 묻는다.
     */
    const source = (await import('node:fs')).readFileSync(
      new URL('../src/lib/policies/policy.ts', import.meta.url),
      'utf8',
    );
    const body = /export async function getPolicyInForceAt[\s\S]*?\n\}/.exec(source)?.[0] ?? '';
    expect(body).toContain('findFirst');
    expect(body).not.toContain('getPolicyRevisions');
    expect(body).not.toContain('take');
  });
});
