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
    /**
     * @capgo/capacitor-social-login. 셸이 등록해 주는 것만 쓴다.
     *
     * 타입을 여기 손으로 적는다. 패키지를 import 하면 이 패키지의 "의존성
     * 0개" 가 깨지고, 브라우저로 들어온 사람에게까지 그 코드가 나간다.
     */
    /**
     * @capacitor/splash-screen. 시작 화면을 우리가 내린다.
     *
     * 셸은 배포된 웹앱을 **네트워크로** 받아 온다 — 앱 안에 화면이 들어
     * 있는 것이 아니다. 그래서 시작 화면을 그냥 두면 웹이 아직 오지 않은
     * 동안 흰 화면이 남고, 사용자는 앱이 멈춘 줄 안다. 화면이 그려진
     * 뒤에 우리가 내린다.
     */
    SplashScreen?: {
      hide(options?: { fadeOutDuration?: number }): Promise<void>;
    };
    SocialLogin?: {
      initialize(options: {
        google?: { webClientId?: string; iOSClientId?: string; iOSServerClientId?: string };
      }): Promise<void>;
      login(options: { provider: 'google'; options: Record<string, unknown> }): Promise<{
        provider: string;
        result: { idToken?: string | null };
      }>;
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

/**
 * 시작 화면을 내린다.
 *
 * **화면이 그려진 뒤에 부른다.** 설정에도 상한(launchShowDuration)을 두었지만
 * 그건 안전망이다 — 웹이 먼저 오면 그만큼 일찍 내리는 것이 맞다.
 *
 * 셸 밖에서는 아무 일도 하지 않는다. 실패해도 삼킨다 — 시작 화면이 안
 * 내려가는 것보다 나쁜 것은 없지만, 그건 상한이 대신 처리한다.
 */
export async function hideSplash(): Promise<void> {
  const plugin = bridge()?.Plugins?.SplashScreen;
  if (!plugin) return;
  try {
    await plugin.hide({ fadeOutDuration: 200 });
  } catch {
    // 이미 내려갔거나 셸이 이 플러그인을 안 실었다. 둘 다 할 일이 없다.
  }
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

// ── 구글 로그인 (네이티브) ─────────────────────────────────────

export interface GoogleClientIds {
  /** 안드로이드와 서버 검증의 기준이 되는 값 */
  readonly webClientId: string;
  /** iOS 전용. 없으면 iOS 에서 뜨지 않는다. */
  readonly iosClientId: string;
}

/**
 * 네이티브 구글 로그인으로 ID 토큰을 받는다.
 *
 * **웹뷰 안에서 구글 OAuth 를 열 수 없다.** 구글이 임베디드 웹뷰를 정책으로
 * 막는다(disallowed_useragent). 그래서 계정 선택은 OS 가 띄우는 네이티브
 * 화면이 맡고, 여기서는 그 결과인 ID 토큰만 받아 온다.
 *
 * **검증은 서버가 한다.** 이 토큰은 그냥 문자열이고 여기서 뜯어 보지 않는다 —
 * 클라이언트가 읽은 값으로 신원을 정하면 아무나 만들어 낼 수 있다.
 *
 * 셸 밖이거나 플러그인이 없으면 null 을 준다. 부르는 쪽이 웹 방식으로
 * 넘어갈 수 있게 예외 대신 값으로 알린다.
 */
export async function nativeGoogleIdToken(ids: GoogleClientIds): Promise<string | null> {
  if (!isNativeShell()) return null;

  const plugin = bridge()?.Plugins?.SocialLogin;
  if (!plugin) return null;

  await plugin.initialize({
    google: {
      webClientId: ids.webClientId,
      iOSClientId: ids.iosClientId,
      // iOS 오프라인 모드가 요구하는 값. 웹 클라이언트 ID 와 같아야 한다.
      iOSServerClientId: ids.webClientId,
    },
  });

  const { result } = await plugin.login({ provider: 'google', options: {} });
  return result.idToken ?? null;
}
