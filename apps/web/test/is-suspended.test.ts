import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 이용 정지를 DB 에서 직접 묻는 자리.
 *
 * **이 함수가 있는 까닭이 그대로 위험이다.** 정지하면 세션을 지우지만 세션 쿠키 캐시(5분)는 DB 를 안 보고
 * 통과시킨다. 그 몇 분 동안 **돈이 오가는 창구**(주문 생성)만은 캐시를 믿지 않고 여기로 다시 묻는다.
 *
 * 그런데 **답이 맞는지는 아무도 안 보고 있었다.** 부르는 자리는 `order-suspension-guard` 가 소스로 못 박았지만
 * (부르는지, `createOrder` 보다 앞인지), 이 함수가 늘 `false` 를 돌려줘도 web 6,148 개가 전부 초록이었다 —
 * 정지된 계정이 그 창구를 그대로 지나간다. 짝의 반쪽이 비어 있었다.
 *
 * **느슨한 비교가 일을 하나 더 한다.** `user?.suspendedAt != null` 은 없는 회원(`undefined`)까지 한 번에
 * 거른다. `!==` 로 바꾸면 **없는 회원이 정지된 것으로 읽혀** 탈퇴 직후 같은 경계에서 주문이 막힌다.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { isSuspended } = await import('~/lib/account/suspension');

const arg = () => db.user.findUnique.mock.calls[0]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ suspendedAt: null });
});

describe('정지 여부', () => {
  it('정지 시각이 있으면 정지다', async () => {
    db.user.findUnique.mockResolvedValue({ suspendedAt: new Date('2026-10-20T00:00:00Z') });
    expect(await isSuspended('u-1')).toBe(true);
  });

  it('정지 시각이 없으면 아니다', async () => {
    expect(await isSuspended('u-1')).toBe(false);
  });

  it('정지가 풀린 계정은 다시 통과한다', async () => {
    // 푸는 것은 시각을 비우는 일이다 — 따로 적는 칸이 없다
    db.user.findUnique.mockResolvedValue({ suspendedAt: null });
    expect(await isSuspended('u-1')).toBe(false);
  });
});

describe('없는 회원', () => {
  it('정지로 보지 않는다 — 던지지도 않는다', async () => {
    /*
     * 없는 회원을 정지로 읽으면 **탈퇴 직후 같은 경계에서 주문이 막힌다.** 없는 것과 정지된 것은
     * 다른 일이고, 없는 회원은 이 함수 뒤의 다른 관문이 다룬다.
     */
    db.user.findUnique.mockResolvedValue(null);
    expect(await isSuspended('u-없음')).toBe(false);
  });
});

describe('무엇을 묻는가', () => {
  it('그 회원만 찾는다', async () => {
    await isSuspended('u-1');
    expect(arg().where).toEqual({ id: 'u-1' });
  });

  it('정지 칸 하나만 읽는다 — 돈이 오가는 길목에서 쓰는 조회다', async () => {
    /*
     * 주문 생성마다 한 번씩 도는 조회다. 회원 행을 통째로 끌고 오면 그 비용이 결제 경로에
     * 그대로 얹히고, 쓰지도 않을 개인정보가 함께 올라온다.
     */
    await isSuspended('u-1');
    expect(arg().select).toEqual({ suspendedAt: true });
  });
});
