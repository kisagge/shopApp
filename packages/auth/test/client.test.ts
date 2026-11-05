import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 브라우저·앱용 인증 클라이언트.
 *
 * **이 조각에는 검사가 하나도 없었다** — 커버리지로 물어서 찾았다. 웹 쪽 검사들이
 * `@shop/auth/client` 를 흉내 내고 지나가므로 **실행된 적이 없다.** 그런데 주석은
 * 보안을 셋이나 약속한다:
 *
 *   1. 웹에서는 Bearer 토큰을 **붙이지 않는다** — 쿠키가 이미 하는 일이다
 *   2. 웹에서는 토큰을 **저장하지 않는다** — 브라우저 저장소에 두면 XSS 로 새어 나갈
 *      자리를 하나 더 만든다
 *   3. 로그아웃은 서버 세션과 기기의 토큰을 **함께** 지운다 — 토큰만 남으면 다음에 앱을
 *      켠 사람은 서버가 거절할 때까지 로그인한 것처럼 보인다
 *
 * 옆의 그물 둘(`sign-out-door`·`auth-client-boundary`)은 **누가 무엇을 들여오고 부르는지**
 * 만 본다. 약속이 지켜지는지는 아무도 안 붙들고 있었다.
 *
 * 설정을 통째로 가로채서 본다 — `createAuthClient` 에 넘긴 것이 곧 요청마다 도는 규칙이다.
 */

interface Captured {
  readonly baseURL?: string;
  readonly fetchOptions: {
    readonly auth: { readonly type: string; readonly token: () => string };
    readonly onSuccess: (ctx: { response: { headers: Headers } }) => void;
  };
}

const client = vi.hoisted(() => {
  const captured: { options: Captured | undefined } = { options: undefined };
  return { captured, signOut: vi.fn<() => Promise<void>>() };
});
vi.mock('better-auth/react', () => ({
  createAuthClient: (options: Captured) => {
    client.captured.options = options;
    return { signOut: client.signOut };
  },
}));

const native = vi.hoisted(() => ({
  isNativeShell: vi.fn<() => boolean>(),
  sessionToken: vi.fn<() => string | null>(),
  saveSessionToken: vi.fn<(token: string) => Promise<void>>(),
  clearSessionToken: vi.fn<() => Promise<void>>(),
}));
vi.mock('@shop/native', () => native);

const clientModule = await import('../src/client');
const { authClient, signOutEverywhere } = clientModule;

const options = client.captured.options;
// 가로채기가 헛돌면 아래 검사들이 조용히 통과하거나 엉뚱한 것을 본다 — 여기서 끝낸다
if (options === undefined) throw new Error('createAuthClient 가 설정을 넘기지 않았다');

/** 응답 하나 — 로그인·가입 응답에만 토큰이 실려 온다 */
const responseWith = (token: string | null) => ({
  response: { headers: new Headers(token === null ? {} : { 'set-auth-token': token }) },
});

beforeEach(() => {
  vi.clearAllMocks();
  native.isNativeShell.mockReturnValue(false);
  native.sessionToken.mockReturnValue(null);
  native.saveSessionToken.mockResolvedValue(undefined);
  native.clearSessionToken.mockResolvedValue(undefined);
  client.signOut.mockResolvedValue(undefined);
});

/**
 * 가로채기가 헛돌지 않는지 먼저 본다. 설정을 못 받았으면 아래 검사들이 **조용히
 * 통과**하거나 엉뚱한 것을 보게 된다.
 */
describe('가로챈 설정', () => {
  it('클라이언트를 만들 때 규칙을 함께 넘긴다', () => {
    expect(options.fetchOptions.auth.type).toBe('Bearer');
    expect(typeof options.fetchOptions.auth.token).toBe('function');
    expect(typeof options.fetchOptions.onSuccess).toBe('function');
  });

  it('만든 클라이언트를 그대로 내보낸다', () => {
    expect(authClient.signOut).toBe(client.signOut);
  });
});

/**
 * **웹에서는 토큰을 붙이지 않는다.**
 *
 * 쿠키가 이미 하는 일을 두 번 할 이유가 없다. 붙이게 되면 같은 요청에 쿠키와 Bearer 가
 * 함께 가고, 어느 쪽으로 인증됐는지가 서버 설정에 따라 갈린다 — 로그아웃했는데 토큰으로
 * 붙는 상태가 만들어질 수 있다.
 *
 * 토큰을 **읽지도 않는다**는 것까지 본다. 읽어다 버리는 코드는 "웹에서도 토큰을 쓴다" 고
 * 읽는 사람을 속인다.
 */
describe('요청에 붙이는 토큰', () => {
  it('웹에서는 빈 글자이고, 토큰을 아예 묻지 않는다', () => {
    expect(options.fetchOptions.auth.token()).toBe('');
    expect(native.sessionToken).not.toHaveBeenCalled();
  });

  it('앱에서는 메모리에 든 토큰을 준다', () => {
    native.isNativeShell.mockReturnValue(true);
    native.sessionToken.mockReturnValue('tok-abc');

    expect(options.fetchOptions.auth.token()).toBe('tok-abc');
  });

  /**
   * **앱인데 아직 토큰이 없으면 빈 글자다.**
   *
   * 앱이 뜰 때 `hydrateSessionToken()` 이 저장소에서 올려 두는데, 그 전에 요청이 나갈 수
   * 있다(첫 화면이 세션을 묻는다). `null` 을 그대로 흘리면 헤더에 `Bearer null` 이 실린다.
   */
  it('앱인데 토큰이 없으면 빈 글자다', () => {
    native.isNativeShell.mockReturnValue(true);
    native.sessionToken.mockReturnValue(null);

    expect(options.fetchOptions.auth.token()).toBe('');
  });

  /** 요청마다 **동기로** 묻는다 — 기다려야 하는 값이면 요청이 토큰 없이 먼저 나간다 */
  it('기다리지 않고 바로 값을 준다', () => {
    native.isNativeShell.mockReturnValue(true);
    native.sessionToken.mockReturnValue('tok-abc');

    const value: unknown = options.fetchOptions.auth.token();
    expect(value).not.toBeInstanceOf(Promise);
    expect(typeof value).toBe('string');
  });
});

/**
 * **웹에서는 토큰을 저장하지 않는다.**
 *
 * 로그인 응답에는 웹에서도 `set-auth-token` 이 실려 온다. 그것을 브라우저 저장소에 두면
 * **XSS 로 새어 나갈 자리를 하나 더 만드는 셈**이고, 쿠키가 이미 하는 일이라 얻는 것도
 * 없다(`HttpOnly` 쿠키는 스크립트가 못 읽는다).
 *
 * **문이 둘이다.** 여기서 걸러 내고, `saveSessionToken` 자신도 앱이 아니면 되돌아간다
 * (`@shop/native`). 둘을 따로 못 박는다 — 하나를 지워도 다른 쪽 검사가 지므로 어느
 * 것이 사라졌는지가 보인다. 여기 것이 첫째 문이다.
 */
describe('로그인 응답의 토큰', () => {
  it('웹에서는 저장하지 않는다', () => {
    options.fetchOptions.onSuccess(responseWith('tok-abc'));

    expect(native.saveSessionToken).not.toHaveBeenCalled();
  });

  it('앱에서는 저장한다', () => {
    native.isNativeShell.mockReturnValue(true);
    options.fetchOptions.onSuccess(responseWith('tok-abc'));

    expect(native.saveSessionToken).toHaveBeenCalledWith('tok-abc');
  });

  /**
   * 토큰은 **로그인·가입 응답에만** 실려 온다. 나머지 응답마다 빈 값을 저장하면 들고
   * 있던 토큰을 빈 글자로 덮어쓴다 — 그때부터 앱은 로그인한 적 없는 상태가 된다.
   */
  it.each([
    ['헤더가 없는 응답', null],
    ['빈 글자가 실려 온 응답', ''],
  ])('앱이어도 %s 에는 저장하지 않는다', (_label, token) => {
    native.isNativeShell.mockReturnValue(true);
    options.fetchOptions.onSuccess(responseWith(token));

    expect(native.saveSessionToken).not.toHaveBeenCalled();
  });
});

/**
 * **로그아웃은 둘을 함께 지운다.**
 *
 * 서버 세션만 끊고 기기의 토큰을 남기면, 다음에 앱을 켠 사람은 **서버가 거절할 때까지
 * 로그인한 것처럼 보인다** — 헤더에는 이름이 뜨는데 들어갈 수 있는 화면이 없다.
 */
describe('로그아웃', () => {
  it('서버 세션을 끊고 기기의 토큰도 지운다', async () => {
    await signOutEverywhere();

    expect(client.signOut).toHaveBeenCalledTimes(1);
    expect(native.clearSessionToken).toHaveBeenCalledTimes(1);
  });

  /**
   * **창구가 안 되더라도 기기의 토큰은 지운다.**
   *
   * 로그아웃을 누르는 자리는 지하철이기도 하고 기내이기도 하다. 네트워크가 끊겨 요청이
   * 실패했을 때 토큰을 남겨 두면, 그 기기는 **로그아웃했다고 믿는 사람의 손에서 아직
   * 로그인된 상태**로 있다. 서버 세션은 만료를 기다릴 수 있지만 기기에 남은 값은 지금
   * 지울 수 있다.
   *
   * 오류는 **덮지 않는다** — 부르는 쪽이 "로그아웃하지 못했습니다" 를 띄울 수 있어야 한다.
   */
  it('서버 세션 끊기가 터져도 토큰을 지우고, 오류는 그대로 올린다', async () => {
    client.signOut.mockRejectedValue(new Error('네트워크가 끊겼다'));

    await expect(signOutEverywhere()).rejects.toThrow('네트워크가 끊겼다');
    expect(native.clearSessionToken).toHaveBeenCalledTimes(1);
  });
});

/**
 * **문을 하나만 남긴다.**
 *
 * 예전에는 `export const { signIn, signUp, signOut, … } = authClient` 가 있었다. 들여오는
 * 곳은 한 군데도 없었는데, 그 안에 `signOut` 이 있다 — 그것을 부르면 서버 세션만 끊기고
 * 기기의 토큰은 남는다. 바로 옆에 `signOutEverywhere` 가 있는데도 **한 글자 짧은 쪽이
 * 손에 먼저 닿는다.** 그래서 지웠고, 여기서 다시 생기지 않게 못 박는다.
 *
 * 부르는 자리를 보는 그물은 `apps/web` 에 따로 있다(`sign-out-door`). 이쪽은 **내보내는
 * 문이 몇 개인지**를 본다 — 둘이 같은 규칙의 양쪽 끝이다.
 */
describe('내보내는 문', () => {
  it('둘뿐이다', () => {
    expect(Object.keys(clientModule).sort()).toEqual(['authClient', 'signOutEverywhere']);
  });
});
