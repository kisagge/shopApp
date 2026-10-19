import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * 지난 방침 목록.
 *
 * **스무 개에서 조용히 잘렸다.** 손님 화면은 이 목록 위에 "언제 동의했는지에 따라 적용되는
 * 글이 다릅니다" 라고 적어 두는데, 스물한 번째 판부터는 목록에 없고 "더 보기" 도 없었다.
 * 가장 오래전에 동의한 사람 — 분쟁에서 그 글을 가장 필요로 하는 사람 — 이 자기 판을 찾을
 * 길이 없다. 주소로 열면(`?v=`) 보이기는 하지만, 그 주소를 알 길이 목록뿐이다.
 *
 * 상한이 필요해 보였던 까닭은 조회가 판마다 **약관 전문**을 함께 끌어왔기 때문이다.
 * 목록이 그리는 것은 날짜 둘과 그 글로 가는 id 뿐이다.
 */

const db = vi.hoisted(() => ({
  policyRevision: { findMany: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: { JsonNull: 'JsonNull' } }));
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const { getPolicyRevisions } = await import('~/lib/policies/policy');

const rows = [
  { id: 'rev-2', effectiveAt: new Date('2026-03-01T00:00:00Z'), replacedAt: new Date('2026-06-01T00:00:00Z') },
  { id: 'rev-1', effectiveAt: new Date('2025-01-01T00:00:00Z'), replacedAt: new Date('2026-03-01T00:00:00Z') },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.policyRevision.findMany.mockResolvedValue(rows);
});

const argsOf = () => db.policyRevision.findMany.mock.calls[0]![0];

describe('지난 방침 목록', () => {
  it('판을 감추지 않는다 — 상한이 없다', async () => {
    await getPolicyRevisions('TERMS');
    expect(argsOf()).not.toHaveProperty('take');
    expect(argsOf()).not.toHaveProperty('skip');
  });

  it('목록이 그리는 것만 읽는다 — 약관 전문을 판 수만큼 끌어오지 않는다', async () => {
    /*
     * 감출 이유가 없어진 까닭이 여기 있다. 날짜 둘과 id 만 읽으면 이력 전체가 가볍다.
     * 본문을 다시 넣으면 목록 한 번에 문서 여러 벌이 딸려 오고, 그때 또 상한이 필요해진다.
     */
    await getPolicyRevisions('TERMS');
    expect(argsOf().select).toEqual({ id: true, effectiveAt: true, replacedAt: true });
  });

  it('최근에 바뀐 것부터 — 사람이 찾는 것은 보통 최근 것이다', async () => {
    await getPolicyRevisions('TERMS');
    expect(argsOf().orderBy).toEqual({ replacedAt: 'desc' });
  });

  it('다른 종류의 방침을 섞지 않는다', async () => {
    await getPolicyRevisions('PRIVACY');
    expect(argsOf().where).toEqual({ kind: 'PRIVACY' });
  });

  it('읽은 줄을 그대로 돌려준다', async () => {
    expect(await getPolicyRevisions('TERMS')).toEqual(rows);
  });

  it('부르는 쪽이 상한을 끼워 넣을 자리가 없다', async () => {
    /*
     * 기본값이 스물이던 `take` 가 두 번째 인자로 열려 있었다. 기본값을 지우기만 하면 다음
     * 사람이 그 자리에 다시 숫자를 넣는다 — 인자 자체를 없앴다는 것을 못 박는다.
     */
    const source = readFileSync(new URL('../src/lib/policies/policy.ts', import.meta.url), 'utf8');
    const signature = /export async function getPolicyRevisions\([^)]*\)/.exec(source)?.[0] ?? '';
    expect(signature).toBe('export async function getPolicyRevisions(kind: PolicyKind)');
  });
});
