import { describe, it, expect, vi, beforeEach } from 'vitest';

const session = vi.hoisted(() => ({
  getSessionUser: vi.fn<(...a: any[]) => any>(),
  getCurrentUser: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/auth/session', () => session);

const nextHeaders = vi.hoisted(() => ({ headers: vi.fn<(...a: any[]) => any>() }));
vi.mock('next/headers', () => nextHeaders);

/**
 * `unstable_rethrow` 는 "Next 가 흐름을 제어하려고 던진 것" 만 다시 던진다.
 * 여기서는 그 판단을 흉내 내 **다시 던지는 쪽과 삼키는 쪽**을 가른다.
 */
const CONTROL = Symbol('next-control-flow');
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && CONTROL in error) throw error;
  },
}));

const { getViewer, getNavUser } = await import('~/lib/viewer');

/**
 * 이번 요청을 보낸 사람.
 *
 * **문장 열이 전부 안 돌았다.** 열 줄이지만 하는 일이 둘이다 — 요청 안에서 세션을
 * **한 번만** 읽게 묶고, 요청 맥락이 없을 때 비로그인으로 보되 **Next 가 흐름을
 * 제어하려고 던진 것은 그대로 넘긴다.**
 *
 * **앞쪽은 여기서 못 박지 못한다.** 리액트의 `cache()` 는 요청 범위 안에서만
 * 묶어 주고, 검사에는 그 범위가 없어서 두 번 부르면 두 번 읽는다(재 봤다).
 * 묶이는지는 화면이 실제로 도는 자리에서만 드러난다.
 *
 * 뒤쪽이 미묘하다. `redirect()` 와 `notFound()` 는 예외로 구현되어 있어서,
 * `try/catch` 로 통째로 삼키면 **넘기려던 화면이 안 넘어가고** 그 자리에
 * 비로그인 화면이 그려진다 — 로그인하라고 보내야 하는 자리에서 조용히
 * "로그인하지 않은 사람" 으로 보이는 것이 가장 나쁘다.
 */

const user = { id: 'u-1', name: '장보영', role: 'CUSTOMER' };

beforeEach(() => {
  vi.clearAllMocks();
  nextHeaders.headers.mockResolvedValue(new Headers());
  session.getSessionUser.mockResolvedValue(user);
  session.getCurrentUser.mockResolvedValue(user);
});

describe('세션을 읽는다', () => {
  it('헤더를 그대로 넘겨 사람을 알아본다', async () => {
    const headers = new Headers({ cookie: 'a=b' });
    nextHeaders.headers.mockResolvedValue(headers);

    await expect(getViewer()).resolves.toBe(user);
    expect(session.getSessionUser).toHaveBeenCalledWith(headers);
  });

  it('헤더가 쓰는 사람은 역할을 지금 상태로 본다 — 세션에 실린 역할이 아니다', async () => {
    /*
     * 역할 뱃지는 콘솔로 가는 문이다. 세션에 실린 역할로 그리면 정지된 가맹점에게
     * 문이 그대로 남고, 눌러 보면 말없이 튕긴다.
     */
    await expect(getNavUser()).resolves.toBe(user);
    expect(session.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(session.getSessionUser).not.toHaveBeenCalled();
  });
});

describe('요청 맥락이 없을 때', () => {
  it('비로그인으로 본다 — 화면을 터뜨리지 않는다', async () => {
    nextHeaders.headers.mockRejectedValue(new Error('headers() outside request'));

    await expect(getViewer()).resolves.toBeNull();
  });

  it('세션 조회가 넘어져도 같다', async () => {
    session.getSessionUser.mockRejectedValue(new Error('DB 가 없다'));

    await expect(getViewer()).resolves.toBeNull();
  });

  it('헤더가 쓰는 쪽도 같다', async () => {
    session.getCurrentUser.mockRejectedValue(new Error('DB 가 없다'));

    await expect(getNavUser()).resolves.toBeNull();
  });
});

describe('Next 가 흐름을 제어하려고 던진 것', () => {
  /** `redirect()`·`notFound()` 가 던지는 모양 */
  const control = () => Object.assign(new Error('NEXT_REDIRECT'), { [CONTROL]: true });

  it('삼키지 않고 그대로 넘긴다 — 넘기려던 화면이 안 넘어가면 안 된다', async () => {
    session.getSessionUser.mockRejectedValue(control());

    await expect(getViewer()).rejects.toThrow('NEXT_REDIRECT');
  });

  it('헤더가 쓰는 쪽도 그대로 넘긴다', async () => {
    session.getCurrentUser.mockRejectedValue(control());

    await expect(getNavUser()).rejects.toThrow('NEXT_REDIRECT');
  });
});
