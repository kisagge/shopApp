import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 오류함 조회 — 권한, 필터, 미처리 수, 처리 표시와 되돌리기.
 *
 * **이 조회는 플랫폼 전체의 것이다.** 스택에는 우리 코드 구조가 그대로 드러나고, 다른 가맹점 화면에서 난 오류까지
 * 보인다. 그래서 가맹점이 가지지 않는 `analytics:all` 을 묻는데, 그 권한 이름을 단정하는 검사가 한 줄도 없었다 —
 * `order:read` 로 바꿔도 전부 초록이었다.
 *
 * 나머지는 운영진이 **고쳤는지를 추적하는 자리**라서 틀려도 조용하다: 처리한 것을 보는 동안 메뉴의 미처리 수가
 * 바뀌거나, 되돌린 오류에 처리자가 남아 있거나, 처리한 것을 지워 버리면 "고쳤다고 했는데 또 난다" 를 못 본다.
 */

const db = vi.hoisted(() => ({
  errorGroup: {
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
    deleteMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getErrorGroups, setErrorResolved } = await import('~/lib/queries/admin/errors');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };

const ROW = {
  fingerprint: 'E2E|/cart|boom',
  source: 'browser',
  severity: 'fatal',
  name: 'TypeError',
  message: '읽을 수 없습니다',
  stack: 'at Cart (src/app/cart/page.tsx:12)',
  routePath: '/cart',
  routeType: 'browser',
  method: 'GET',
  path: '/cart',
  count: 7,
  firstSeenAt: new Date('2026-10-01T00:00:00Z'),
  lastSeenAt: new Date('2026-10-20T00:00:00Z'),
  resolvedAt: null,
  resolvedBy: { name: '박운영' },
};

const where = () => db.errorGroup.findMany.mock.calls[0]?.[0].where;
const countWhere = () => db.errorGroup.count.mock.calls[0]?.[0].where;

beforeEach(() => {
  vi.clearAllMocks();
  db.errorGroup.findMany.mockResolvedValue([ROW]);
  db.errorGroup.count.mockResolvedValue(3);
  db.errorGroup.update.mockResolvedValue({ resolvedAt: null });
});

describe('오류함을 볼 수 있는 사람', () => {
  it('가맹점은 못 본다 — analytics:all 이 없다', async () => {
    await expect(getErrorGroups(merchant)).rejects.toThrow(/analytics:all/);
  });

  it('막힌 조회는 DB 를 치지 않는다', async () => {
    // 권한을 보기 전에 읽으면, 막아도 이미 읽은 뒤다
    await expect(getErrorGroups(merchant)).rejects.toThrow();
    expect(db.errorGroup.findMany).not.toHaveBeenCalled();
    expect(db.errorGroup.count).not.toHaveBeenCalled();
  });

  it('운영진은 본다', async () => {
    await expect(getErrorGroups(admin)).resolves.toMatchObject({ openCount: 3 });
  });
});

describe('무엇을 읽어 오는지', () => {
  it('기본은 아직 처리하지 않은 것만', async () => {
    await getErrorGroups(admin);
    expect(where()).toEqual({ resolvedAt: null });
  });

  it('처리한 것을 달라고 하면 처리한 것만', async () => {
    await getErrorGroups(admin, { resolved: true });
    expect(where()).toEqual({ resolvedAt: { not: null } });
  });

  it('resolved: false 는 기본과 같다 — 미처리를 뜻한다', async () => {
    /*
     * 구현이 `options.resolved === true` 로 가른다. false 를 "처리한 것을 빼고" 로 읽든
     * "기본" 으로 읽든 결과가 같아야 하고, 그 둘이 갈리면 화면의 토글이 세 상태가 된다.
     */
    await getErrorGroups(admin, { resolved: false });
    expect(where()).toEqual({ resolvedAt: null });
  });

  it('최근에 난 것부터 — 어제 한 번 난 것보다 방금 나고 있는 것이 급하다', async () => {
    await getErrorGroups(admin);
    expect(db.errorGroup.findMany.mock.calls[0]?.[0].orderBy).toEqual({ lastSeenAt: 'desc' });
  });

  it('한 번에 가져오는 수를 끊는다', async () => {
    await getErrorGroups(admin);
    expect(db.errorGroup.findMany.mock.calls[0]?.[0].take).toBe(50);
  });
});

describe('미처리 수', () => {
  /*
   * 메뉴와 머리글이 이 값을 읽는다. 목록의 필터를 따라가면 **처리한 것을 보는 동안 0 이 되고**,
   * 운영진은 남은 일이 없다고 읽는다.
   */
  it('처리한 것을 보고 있어도 미처리를 센다', async () => {
    await getErrorGroups(admin, { resolved: true });
    expect(countWhere()).toEqual({ resolvedAt: null });
  });

  it('목록과 함께 센다 — 화면이 두 번 기다리지 않는다', async () => {
    await getErrorGroups(admin);
    expect(db.errorGroup.findMany).toHaveBeenCalledTimes(1);
    expect(db.errorGroup.count).toHaveBeenCalledTimes(1);
  });
});

describe('처리자를 내보내는 모양', () => {
  it('이름만 펴서 준다 — 계정을 그대로 내보내지 않는다', async () => {
    const { items } = await getErrorGroups(admin);
    expect(items[0]?.resolvedBy).toBe('박운영');
  });

  it('처리자가 없으면 null', async () => {
    db.errorGroup.findMany.mockResolvedValue([{ ...ROW, resolvedBy: null }]);
    const { items } = await getErrorGroups(admin);
    expect(items[0]?.resolvedBy).toBeNull();
  });

  it('계정에서 이름만 읽는다 — 이메일을 가져오지 않는다', async () => {
    await getErrorGroups(admin);
    expect(db.errorGroup.findMany.mock.calls[0]?.[0].select.resolvedBy).toEqual({
      select: { name: true },
    });
  });

  it('난 자리와 횟수를 그대로 싣는다', async () => {
    const { items } = await getErrorGroups(admin);
    expect(items[0]).toMatchObject({
      fingerprint: ROW.fingerprint,
      routePath: '/cart',
      count: 7,
      firstSeenAt: ROW.firstSeenAt,
      lastSeenAt: ROW.lastSeenAt,
    });
  });
});

describe('처리했다고 표시하기', () => {
  it('가맹점은 못 한다', async () => {
    await expect(setErrorResolved(merchant, ROW.fingerprint, true)).rejects.toThrow(/analytics:all/);
    expect(db.errorGroup.update).not.toHaveBeenCalled();
  });

  it('누른 사람과 시각을 남긴다', async () => {
    await setErrorResolved(admin, ROW.fingerprint, true);
    const arg = db.errorGroup.update.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ fingerprint: ROW.fingerprint });
    expect(arg.data.resolvedById).toBe('u-admin');
    expect(arg.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('되돌리면 처리자까지 비운다', async () => {
    /*
     * 시각만 비우면 **처리한 적 있는 사람이 그대로 남는다.** 다시 난 오류를 열어 보고
     * 아직 아무도 안 봤는데 "박운영이 처리함" 이 붙어 있으면, 그 사람에게 묻게 된다.
     */
    await setErrorResolved(admin, ROW.fingerprint, false);
    expect(db.errorGroup.update.mock.calls[0]?.[0].data).toEqual({
      resolvedAt: null,
      resolvedById: null,
    });
  });

  it('지우지 않는다 — 몇 번 났는지가 남아 있어야 "또 난다" 를 본다', async () => {
    await setErrorResolved(admin, ROW.fingerprint, true);
    expect(db.errorGroup.delete).not.toHaveBeenCalled();
    expect(db.errorGroup.deleteMany).not.toHaveBeenCalled();
  });
});
