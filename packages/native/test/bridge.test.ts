// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNativeShell, nativePlatform, hydrateSessionToken, sessionToken,
  saveSessionToken, clearSessionToken, resetSessionTokenForTest, nativeGoogleIdToken,
  onAppUrlOpen,
} from '../src/index';

/** 셸이 웹뷰에 주입해 주는 것을 흉내 낸다 */
function installBridge(over: Record<string, unknown> = {}) {
  const prefs = {
    get: vi.fn(async () => ({ value: null as string | null })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  (window as unknown as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: { Preferences: prefs },
    ...over,
  };
  return prefs;
}

/** 셸이 안전 저장소까지 실어 준 경우 */
function installWithSecure() {
  const secure = {
    get: vi.fn(async () => ({ value: null as string | null })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const prefs = installBridge();
  (window as unknown as { Capacitor: { Plugins: Record<string, unknown> } }).Capacitor.Plugins['SecureStorage'] = secure;
  return { prefs, secure };
}

beforeEach(() => {
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  resetSessionTokenForTest();
});

describe('셸 판별', () => {
  it('브라우저에서는 네이티브가 아니다', () => {
    expect(isNativeShell()).toBe(false);
    expect(nativePlatform()).toBe('web');
  });

  it('셸 안에서는 플랫폼을 알려 준다', () => {
    installBridge();
    expect(isNativeShell()).toBe(true);
    expect(nativePlatform()).toBe('ios');
  });

  it('Capacitor 가 있어도 네이티브가 아니라고 하면 아니다', () => {
    // 웹에서 Capacitor 를 로드한 경우다. 있다는 것만으로 판단하면 안 된다.
    installBridge({ isNativePlatform: () => false });
    expect(isNativeShell()).toBe(false);
  });
});

describe('토큰 — 웹에서는 아무 일도 하지 않는다', () => {
  it('읽어도 null 이다 — 웹은 쿠키로 붙는다', async () => {
    expect(await hydrateSessionToken()).toBeNull();
  });

  it('저장해도 남지 않는다', async () => {
    await saveSessionToken('t-1');
    expect(sessionToken()).toBeNull();
  });
});

describe('토큰 — 셸 안', () => {
  it('저장하면 곧바로 꺼낼 수 있다 — 요청은 동기로 토큰을 묻는다', async () => {
    const prefs = installBridge();

    await saveSessionToken('t-1');

    expect(sessionToken()).toBe('t-1');
    expect(prefs.set).toHaveBeenCalledWith({ key: 'shop.session-token', value: 't-1' });
  });

  it('앱이 뜰 때 저장소에서 메모리로 올린다', async () => {
    const prefs = installBridge();
    prefs.get.mockResolvedValue({ value: 't-저장됨' });

    await hydrateSessionToken();

    expect(sessionToken()).toBe('t-저장됨');
  });

  it('저장소 쓰기가 실패해도 이번 실행에서는 로그인이 유지된다', async () => {
    const prefs = installBridge();
    prefs.set.mockRejectedValue(new Error('디스크 가득'));

    await saveSessionToken('t-1');

    // 다음 실행에 다시 로그인하는 것이 지금 튕기는 것보다 낫다
    expect(sessionToken()).toBe('t-1');
  });

  it('저장소를 못 읽어도 앱은 뜬다', async () => {
    const prefs = installBridge();
    prefs.get.mockRejectedValue(new Error('저장소 오류'));

    await expect(hydrateSessionToken()).resolves.toBeNull();
    expect(sessionToken()).toBeNull();
  });

  it('로그아웃하면 양쪽에서 지운다', async () => {
    const prefs = installBridge();
    await saveSessionToken('t-1');

    await clearSessionToken();

    expect(sessionToken()).toBeNull();
    expect(prefs.remove).toHaveBeenCalledWith({ key: 'shop.session-token' });
  });

  it('저장소 삭제가 실패해도 메모리에서는 지운다', async () => {
    const prefs = installBridge();
    await saveSessionToken('t-1');
    prefs.remove.mockRejectedValue(new Error('저장소 오류'));

    await clearSessionToken();

    // 남은 토큰은 다음 실행에 서버가 거절한다
    expect(sessionToken()).toBeNull();
  });

  it('플러그인이 없어도 무너지지 않는다', async () => {
    installBridge({ Plugins: {} });

    await expect(saveSessionToken('t-1')).resolves.toBeUndefined();
    await expect(hydrateSessionToken()).resolves.toBeNull();
  });
});

/**
 * 안전 저장소가 있으면 그쪽에 둔다.
 *
 * **Preferences 는 평문이다.** iOS 에서는 `UserDefaults.standard` 라 앱 백업에 그대로
 * 딸려 가고, 그 안에 든 것이 세션 토큰 — 서명된 쿠키 값 그 자체다. iOS 에는 백업에서
 * 빼는 스위치가 없어서 자리를 옮기는 것 말고는 길이 없다.
 *
 * 플러그인을 싣는 일은 네이티브 프로젝트를 건드리고 기기에서 확인해야 하는 일이라 따로
 * 떼어 놓았다. 그래서 여기 검사가 보는 것은 **실릴 때와 아직 안 실렸을 때 둘 다 맞게
 * 도는가** 다.
 */
describe('토큰 — 안전 저장소', () => {
  it('실려 있으면 그쪽에 쓰고 평문 자리에는 남기지 않는다', async () => {
    const { prefs, secure } = installWithSecure();

    await saveSessionToken('t-1');

    expect(secure.set).toHaveBeenCalledWith({ key: 'shop.session-token', value: 't-1' });
    expect(prefs.set).not.toHaveBeenCalled();
    // 옛 판에서 온 사본이 있을 수 있다 — 쓰는 길에서 함께 치운다
    expect(prefs.remove).toHaveBeenCalledWith({ key: 'shop.session-token' });
  });

  it('안 실려 있으면 지금처럼 평문 자리를 쓴다 — 동작이 바뀌지 않는다', async () => {
    const prefs = installBridge();

    await saveSessionToken('t-1');

    expect(prefs.set).toHaveBeenCalledWith({ key: 'shop.session-token', value: 't-1' });
    expect(sessionToken()).toBe('t-1');
  });

  it('이미 로그인해 둔 사람의 토큰을 한 번 옮기고 옛 자리를 지운다', async () => {
    /*
     * 옮기지 않으면 그 사람들은 앱을 켤 때 로그아웃되고 평문 사본은 그대로 남는다 —
     * 가장 나쁜 쪽이다.
     */
    const { prefs, secure } = installWithSecure();
    prefs.get.mockResolvedValue({ value: 't-옛자리' });

    await hydrateSessionToken();

    expect(sessionToken()).toBe('t-옛자리');
    expect(secure.set).toHaveBeenCalledWith({ key: 'shop.session-token', value: 't-옛자리' });
    expect(prefs.remove).toHaveBeenCalledWith({ key: 'shop.session-token' });
  });

  it('옮기다 실패하면 이번 실행은 로그인을 유지하고 옛 자리를 지우지 않는다', async () => {
    // 지우고 나서 쓰다 실패하면 토큰이 어디에도 없게 된다. 순서가 뜻이다.
    const { prefs, secure } = installWithSecure();
    prefs.get.mockResolvedValue({ value: 't-옛자리' });
    secure.set.mockRejectedValue(new Error('키체인 잠김'));

    await hydrateSessionToken();

    expect(sessionToken()).toBe('t-옛자리');
    expect(prefs.remove).not.toHaveBeenCalled();
  });

  it('안전 저장소에 있으면 옛 자리를 들여다보지 않는다', async () => {
    const { prefs, secure } = installWithSecure();
    secure.get.mockResolvedValue({ value: 't-안전' });

    await hydrateSessionToken();

    expect(sessionToken()).toBe('t-안전');
    expect(prefs.get).not.toHaveBeenCalled();
  });

  it('없는 키에 오류를 던지는 플러그인도 받는다', async () => {
    /*
     * 키체인 API 가 그렇게 생겼고, 감싸는 플러그인들도 대개 그대로 던진다. 그것을 고장으로
     * 읽으면 이관이 아예 안 돌아, 옛 사람들이 켤 때마다 로그아웃된다.
     */
    const { prefs, secure } = installWithSecure();
    secure.get.mockRejectedValue(new Error('item not found'));
    prefs.get.mockResolvedValue({ value: 't-옛자리' });

    await hydrateSessionToken();

    expect(sessionToken()).toBe('t-옛자리');
    expect(secure.set).toHaveBeenCalled();
  });

  it('로그아웃하면 두 자리를 다 지운다', async () => {
    /*
     * 옮기기 전에 로그인해 둔 사람은 평문 자리에 토큰이 있다. 지금 쓰는 자리만 지우면 그
     * 사본이 로그아웃 뒤에도 남고, 그 글자는 서버 세션이 끊길 때까지 실제로 쓸 수 있다.
     */
    const { prefs, secure } = installWithSecure();

    await clearSessionToken();

    expect(secure.remove).toHaveBeenCalledWith({ key: 'shop.session-token' });
    expect(prefs.remove).toHaveBeenCalledWith({ key: 'shop.session-token' });
  });

  it('한쪽 삭제가 실패해도 다른 쪽은 지운다', async () => {
    const { prefs, secure } = installWithSecure();
    secure.remove.mockRejectedValue(new Error('키체인 잠김'));

    await clearSessionToken();

    expect(prefs.remove).toHaveBeenCalled();
    expect(sessionToken()).toBeNull();
  });
});

describe('네이티브 구글 로그인', () => {
  const ids = { webClientId: 'web-1', iosClientId: 'ios-1' };

  function installSocial(result: { idToken?: string | null }, over: Record<string, unknown> = {}) {
    const plugin = {
      initialize: vi.fn(async () => {}),
      login: vi.fn(async () => ({ provider: 'google', result })),
      ...over,
    };
    installBridge({ Plugins: { SocialLogin: plugin } });
    return plugin;
  }

  it('웹에서는 아무것도 하지 않는다', async () => {
    // 브라우저에서는 평범한 OAuth 이동을 쓴다. 여기서 예외를 던지면
    // 부르는 쪽이 그 사실을 알기 어렵다.
    expect(await nativeGoogleIdToken(ids)).toBeNull();
  });

  it('플러그인이 없으면 null 을 준다 — 웹 방식으로 넘어갈 수 있게', async () => {
    installBridge({ Plugins: {} });
    expect(await nativeGoogleIdToken(ids)).toBeNull();
  });

  it('ID 토큰을 그대로 돌려준다', async () => {
    installSocial({ idToken: 'jwt-1' });
    expect(await nativeGoogleIdToken(ids)).toBe('jwt-1');
  });

  it('iOS 서버 클라이언트 ID 는 웹 것과 같아야 한다', async () => {
    const plugin = installSocial({ idToken: 'jwt-1' });

    await nativeGoogleIdToken(ids);

    expect(plugin.initialize).toHaveBeenCalledWith({
      google: { webClientId: 'web-1', iOSClientId: 'ios-1', iOSServerClientId: 'web-1' },
    });
  });

  it('토큰이 비면 null 이다', async () => {
    // 취소하거나 계정 선택만 하고 나온 경우다. 로그인된 척하면 안 된다.
    installSocial({ idToken: null });
    expect(await nativeGoogleIdToken(ids)).toBeNull();
  });

  it('로그인 실패는 그대로 던진다 — 부르는 쪽이 사용자에게 알려야 한다', async () => {
    installSocial({ idToken: null }, { login: vi.fn(() => Promise.reject(new Error('취소'))) });

    await expect(nativeGoogleIdToken(ids)).rejects.toThrow('취소');
  });
});

describe('링크로 앱이 열렸을 때', () => {
  /**
   * **핸들이 그대로 오기도 하고 약속으로 감싸여 오기도 한다.**
   *
   * 실제로 Capacitor 8 의 네이티브 다리는 핸들을 그냥 돌려준다. 거기에
   * `.then()` 을 부르면 터지는데, 브라우저에서는 이 코드가 아예 안 돌아서
   * 아무도 못 봤다 — 앱을 폰에 올리고 나서야 오류 화면으로 드러났다.
   */
  const cases = [
    ['핸들을 그대로 돌려주는 다리', (h: unknown) => h],
    ['약속으로 감싸 주는 다리', (h: unknown) => Promise.resolve(h)],
  ] as const;

  it.each(cases)('%s 에서도 터지지 않는다', async (_name, wrap) => {
    const remove = vi.fn();
    let fire: ((data: { url: string }) => void) | null = null;
    installBridge({
      Plugins: {
        App: {
          addListener: vi.fn((_e: string, handler: (d: { url: string }) => void) => {
            fire = handler;
            return wrap({ remove });
          }),
        },
      },
    });

    const seen: string[] = [];
    const stop = onAppUrlOpen((path) => seen.push(path));
    await Promise.resolve();

    // 같은 출처여야 넘어간다 — jsdom 이 쓰는 주소를 그대로 쓴다
    fire!({ url: `${window.location.origin}/product/wool-coat?x=1#reviews` });
    expect(seen).toEqual(['/product/wool-coat?x=1#reviews']);

    stop();
    await Promise.resolve();
    expect(remove).toHaveBeenCalled();
  });

  it('다른 출처의 주소는 넘기지 않는다', async () => {
    /*
     * 웹뷰에는 주소창이 없다. 밖에서 준 주소를 그대로 열면 사용자는 자기가
     * 어디에 있는지 알 수 없다.
     */
    let fire: ((data: { url: string }) => void) | null = null;
    installBridge({
      Plugins: {
        App: {
          addListener: vi.fn((_e: string, handler: (d: { url: string }) => void) => {
            fire = handler;
            return { remove: vi.fn() };
          }),
        },
      },
    });

    const seen: string[] = [];
    onAppUrlOpen((path) => seen.push(path));
    await Promise.resolve();

    fire!({ url: 'https://남의사이트.example/product/x' });
    fire!({ url: '주소가 아님' });
    expect(seen).toEqual([]);
  });

  it('셸 밖에서는 아무 일도 하지 않는다', () => {
    expect(() => onAppUrlOpen(() => undefined)()).not.toThrow();
  });
});
