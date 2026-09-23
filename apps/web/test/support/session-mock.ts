import { vi } from 'vitest';

/**
 * 세션 모듈(@shop/auth/session)을 통째로 흉내 낸다.
 *
 * **창구를 하나만 적어 두면 갈라진다.** `() => ({ getActor })` 는 모듈을 그 한 export 로
 * 바꾼다 — 검사 대상 라우트가 옆에 있는 `getSessionUser` 를 쓰기 시작하는 순간 그 파일은
 * `undefined is not a function` 으로 진다. 서른 남짓한 검사 파일이 저마다 필요한 것 하나만
 * 적어 두고 있었고, 이미 세 갈래로 갈려 있었다.
 *
 * 여기서 모든 창구를 한 번에 낸다. 세션 모듈에 창구가 하나 더 생겨도 고칠 곳은 이 파일이다.
 */
export function sessionMock() {
  return {
    getActor: vi.fn<(...a: any[]) => any>(),
    getSessionUser: vi.fn<(...a: any[]) => any>(),
    getCurrentUser: vi.fn<(...a: any[]) => any>(),
    // 역할 이름을 다듬는 순수 함수 — 흉내 낼 것이 없어 그대로 통과시킨다
    normalizeRole: (role: unknown) => role,
  };
}
