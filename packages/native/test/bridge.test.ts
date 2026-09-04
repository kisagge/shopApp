// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isNativeShell, nativePlatform, hydrateSessionToken, sessionToken,
  saveSessionToken, clearSessionToken, resetSessionTokenForTest,
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
