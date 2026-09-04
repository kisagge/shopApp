// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNativeShell, nativePlatform, hydrateSessionToken, sessionToken,
  saveSessionToken, clearSessionToken, resetSessionTokenForTest, nativeGoogleIdToken,
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
