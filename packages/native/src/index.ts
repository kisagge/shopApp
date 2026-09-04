/**
 * 네이티브 셸 다리.
 *
 * **npm 의존성이 없다.** Capacitor 셸은 배포된 웹앱을 그대로 불러오므로
 * (capacitor.config 의 server.url), 웹 번들에 @capacitor/* 를 넣으면 브라우저로
 * 들어온 사람에게까지 그 코드가 나간다. 셸이 웹뷰에 주입해 주는 window.Capacitor
 * 를 직접 쓰면 웹 번들은 그대로 두고 네이티브에서만 살아난다.
 *
 * 네이티브 쪽 플러그인 등록은 apps/mobile 이 맡는다 — 거기에만 의존성이 있다.
 */

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    Preferences?: {
      get(options: { key: string }): Promise<{ value: string | null }>;
      set(options: { key: string; value: string }): Promise<void>;
      remove(options: { key: string }): Promise<void>;
    };
  };
}

declare global {
  interface Window {
    Capacitor?: CapacitorBridge;
  }
}

const bridge = (): CapacitorBridge | null =>
  typeof window === 'undefined' ? null : (window.Capacitor ?? null);

/**
 * 지금 네이티브 셸 안인가.
 *
 * 서버에서는 항상 false 다 — window 가 없다. 이 값으로 화면을 가르는 것은
 * 하이드레이션 불일치를 부르므로, **동작을 고르는 데만** 쓴다.
 */
export function isNativeShell(): boolean {
  return bridge()?.isNativePlatform?.() === true;
}

/** 'ios' | 'android' | 'web'. 셸 밖에서는 'web'. */
export function nativePlatform(): string {
  return bridge()?.getPlatform?.() ?? 'web';
}

// ── 세션 토큰 ────────────────────────────────────────────────

const TOKEN_KEY = 'shop.session-token';

/**
 * 메모리에 들고 있는 토큰.
 *
 * Better Auth 클라이언트는 요청마다 토큰을 **동기로** 요구하는데 저장소
 * 읽기는 비동기다. 그래서 시작할 때 한 번 읽어 두고 여기서 꺼내 준다.
 */
let cached: string | null = null;

const store = () => bridge()?.Plugins?.Preferences ?? null;

/**
 * 저장해 둔 토큰을 메모리로 올린다. 앱이 뜰 때 한 번 부른다.
 *
 * 셸 밖이면 아무 일도 하지 않는다 — 웹은 쿠키로 붙으므로 토큰이 필요 없다.
 */
export async function hydrateSessionToken(): Promise<string | null> {
  if (!isNativeShell()) return null;
  try {
    const result = await store()?.get({ key: TOKEN_KEY });
    cached = result?.value ?? null;
  } catch {
    // 저장소를 못 읽어도 앱은 떠야 한다. 로그인 화면으로 가면 그만이다.
    cached = null;
  }
  return cached;
}

/** 지금 쓸 수 있는 토큰. 없으면 null. */
export const sessionToken = (): string | null => cached;

/**
 * 로그인 응답이 준 토큰을 저장한다.
 *
 * 메모리를 **먼저** 채운다. 저장소 쓰기가 실패해도 이번 실행에서는 로그인이
 * 유지돼야 한다 — 다음 실행에 다시 로그인하는 것이 지금 튕기는 것보다 낫다.
 */
export async function saveSessionToken(token: string): Promise<void> {
  if (!isNativeShell()) return;
  cached = token;
  try {
    await store()?.set({ key: TOKEN_KEY, value: token });
  } catch {
    // 다음 실행에 다시 로그인하게 된다. 지금 동작을 막지는 않는다.
  }
}

/** 로그아웃. 메모리와 저장소 양쪽에서 지운다. */
export async function clearSessionToken(): Promise<void> {
  cached = null;
  if (!isNativeShell()) return;
  try {
    await store()?.remove({ key: TOKEN_KEY });
  } catch {
    // 메모리에서는 이미 지웠다. 다음 실행에 남은 토큰은 서버가 거절한다.
  }
}

/** 테스트에서 메모리 상태를 되돌린다 */
export function resetSessionTokenForTest(): void {
  cached = null;
}
