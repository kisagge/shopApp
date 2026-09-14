import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.hoisted(() => vi.fn());
vi.mock('@shop/db', () => ({ prisma: { user: { findUnique } } }));

const { assertNotSuspended, ACCOUNT_SUSPENDED } = await import('../src/suspension');

/**
 * 정지된 회원에게 세션을 내주지 않는다.
 *
 * 연결(세션 생성 훅)은 e2e 가 실제 로그인으로 본다. 여기서는 판정과 **로그인 화면이 알아볼 코드**를 본다 —
 * 코드가 바뀌면 화면은 "비밀번호가 틀렸다" 로 떨어져 사용자가 계속 다시 시도한다.
 */
beforeEach(() => findUnique.mockReset());

describe('assertNotSuspended', () => {
  it('정지되지 않았으면 통과한다', async () => {
    findUnique.mockResolvedValue({ suspendedAt: null });
    await expect(assertNotSuspended('u-1')).resolves.toBeUndefined();
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'u-1' }, select: { suspendedAt: true } });
  });

  it('정지됐으면 403 과 ACCOUNT_SUSPENDED 코드로 막는다', async () => {
    findUnique.mockResolvedValue({ suspendedAt: new Date('2026-09-01') });
    const error = await assertNotSuspended('u-1').catch((e: unknown) => e);
    expect(error).toMatchObject({ statusCode: 403, body: { code: ACCOUNT_SUSPENDED } });
  });

  it('회원을 못 찾으면 막지 않는다 — 없는 회원의 로그인은 이 앞에서 이미 실패한다', async () => {
    findUnique.mockResolvedValue(null);
    await expect(assertNotSuspended('u-x')).resolves.toBeUndefined();
  });
});
