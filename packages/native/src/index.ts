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

interface ListenerHandle {
  remove(): unknown;
}

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
     * 안전 저장소 — iOS 키체인, 안드로이드 EncryptedSharedPreferences.
     *
     * **Preferences 는 평문이다.** iOS 에서는 `UserDefaults.standard`(플러그인 소스에
     * 그렇게 적혀 있다)라 앱 백업에 그대로 딸려 가고, 그 안에 든 것이 세션 토큰 —
     * **서명된 쿠키 값 그 자체**다. 안드로이드는 백업을 껐지만(allowBackup) 파일은
     * 여전히 평문이다. iOS 에는 백업에서 빼는 스위치가 아예 없어서 자리를 옮기는 것
     * 말고는 길이 없다.
     *
     * **셸이 아직 이 플러그인을 싣지 않는다.** 여기 분기를 먼저 둔 까닭은, 플러그인을
     * 붙이는 일은 네이티브 프로젝트를 건드리고 기기에서 한 번 확인해야 하는 일이라
     * 따로 떼어 놓은 것이다 — 그동안 동작은 지금과 똑같다(없으면 Preferences 를 쓴다).
     * 플러그인을 고를 때 이 모양에 맞춰 싣는다. 모양이 다르면 `secureStore()` 한 곳만
     * 고치면 된다.
     */
    SecureStorage?: {
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
    /**
     * @capacitor/share. 시스템 공유 시트를 연다.
     *
     * **웹의 navigator.share 로는 안 되는 자리가 있다.** 안드로이드 웹뷰는
     * 그 API 를 아예 주지 않아서, 셸 안에서는 공유가 조용히 사라진다.
     * 셸이 실어 주는 플러그인이 있으면 그쪽을 먼저 쓴다.
     */
    /**
     * @capacitor/app. 앱이 링크로 열렸을 때를 듣는다.
     *
     * 셸은 이미 그 도메인을 띄우고 있지만, 밖에서 링크로 들어와도 웹뷰는
     * **보고 있던 자리에 그대로 있다.** 어느 주소로 들어왔는지 아는 것은
     * 여기뿐이라, 그 값을 받아 화면을 옮긴다.
     */
    App?: {
      /**
       * **약속을 돌려준다고 믿으면 안 된다.** 네이티브 다리는 핸들을 그냥
       * 돌려주고, 웹 구현은 약속으로 감싸 준다. `.then()` 을 직접 부르면
       * 앞의 경우에 터지는데 — 실제로 그렇게 앱이 오류 화면으로 떨어졌다.
       * 브라우저에서는 이 코드가 아예 안 돌아서 아무도 못 봤다.
       */
      addListener(
        event: 'appUrlOpen',
        handler: (data: { url: string }) => void,
      ): ListenerHandle | Promise<ListenerHandle>;
      /**
       * 안드로이드 뒤로 가기.
       *
       * **여기에 귀를 붙이는 순간 기본 동작이 사라진다.** 아무도 안 듣고
       * 있으면 Capacitor 가 알아서 웹뷰 히스토리를 되돌리거나 앱을 닫는데,
       * 리스너가 하나라도 있으면 그 판단이 통째로 우리 몫이 된다.
       */
      addListener(
        event: 'backButton',
        handler: (data: { canGoBack: boolean }) => void,
      ): ListenerHandle | Promise<ListenerHandle>;
      exitApp(): Promise<void> | void;
    };
    Share?: {
      share(options: { title?: string; text?: string; url?: string }): Promise<unknown>;
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

/**
 * 시스템 공유 시트를 연다.
 *
 * 셸이 이 플러그인을 안 실었거나 셸 밖이면 **false 를 돌려준다** — 부르는
 * 쪽이 다음 수단(navigator.share · 주소 복사)으로 넘어갈 수 있게 한다.
 * 사용자가 시트를 그냥 닫은 것도 성공으로 본다. 취소는 실패가 아니다.
 */
export async function nativeShare(options: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<boolean> {
  const plugin = bridge()?.Plugins?.Share;
  if (!plugin) return false;
  try {
    await plugin.share(options);
  } catch {
    // 취소했거나 보낼 곳이 없다. 어느 쪽이든 여기서 더 할 일은 없다.
  }
  return true;
}

/**
 * 링크로 앱이 열렸을 때 그 주소를 받는다.
 *
 * **같은 출처의 주소만 넘긴다.** 앱 링크는 우리 도메인만 잡도록 걸려 있지만,
 * 커스텀 스킴이나 남이 만든 인텐트로도 이 자리가 불릴 수 있다. 밖에서 준
 * 주소를 그대로 열면 웹뷰를 아무 데나 보내는 통로가 된다 — 웹뷰에는
 * 주소창이 없어서 사용자는 어디에 있는지 알 수 없다.
 *
 * 정리를 돌려준다. 부르는 쪽이 화면을 떠날 때 떼면 된다.
 */
export function onAppUrlOpen(handler: (path: string) => void): () => void {
  const plugin = bridge()?.Plugins?.App;
  if (!plugin || typeof window === 'undefined') return () => undefined;

  let handle: ListenerHandle | null = null;
  let stopped = false;

  void (async () => {
    /*
     * **await 로 받는다.** 이 자리는 핸들이 그대로 오기도 하고 약속으로
     * 감싸여 오기도 하는데, await 는 둘 다 받는다. 처음에 .then() 을
     * 직접 불렀다가 앱이 오류 화면으로 떨어졌다.
     */
    const opened = await plugin.addListener('appUrlOpen', ({ url }) => {
      try {
        const incoming = new URL(url);
        if (incoming.origin !== window.location.origin) return;
        handler(incoming.pathname + incoming.search + incoming.hash);
      } catch {
        // 주소로 읽히지 않는 것은 우리 것이 아니다
      }
    });

    // 붙기 전에 화면이 떠났으면 바로 뗀다. 남겨 두면 죽은 화면이 듣는다.
    if (stopped) void opened.remove();
    else handle = opened;
  })();

  return () => {
    stopped = true;
    void handle?.remove();
  };
}

/**
 * 안드로이드 뒤로 가기를 받는다.
 *
 * **귀를 붙이면 기본 동작이 사라진다.** 그래서 되돌릴 곳이 있으면 우리가
 * 되돌려 줘야 한다 — 안 그러면 앱 안에서 뒤로 가기가 아무 일도 안 한다.
 *
 * 셸 밖에서는 아무 일도 하지 않는다. 안드로이드에만 있는 단추다.
 */
export function onBackButton(handler: (canGoBack: boolean) => void): () => void {
  const plugin = bridge()?.Plugins?.App;
  if (!plugin) return () => undefined;

  let handle: ListenerHandle | null = null;
  let stopped = false;

  void (async () => {
    const opened = await plugin.addListener('backButton', ({ canGoBack }) => {
      handler(canGoBack === true);
    });
    if (stopped) void opened.remove();
    else handle = opened;
  })();

  return () => {
    stopped = true;
    void handle?.remove();
  };
}

/**
 * 앱을 닫는다.
 *
 * 안드로이드에만 뜻이 있다 — iOS 는 앱이 스스로 닫는 것을 허용하지 않고,
 * 애초에 뒤로 가기 단추도 없다.
 */
export function exitApp(): void {
  void bridge()?.Plugins?.App?.exitApp();
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

/** 토큰 한 개를 두는 자리. 어느 플러그인이든 이 모양으로 감싸서 쓴다. */
interface TokenStore {
  get(): Promise<string | null>;
  set(value: string): Promise<void>;
  remove(): Promise<void>;
}

/** 지금까지 쓴 자리 — 평문이다 */
const plainStore = (): TokenStore | null => {
  const plugin = bridge()?.Plugins?.Preferences;
  if (!plugin) return null;
  return {
    get: async () => (await plugin.get({ key: TOKEN_KEY })).value ?? null,
    set: async (value) => { await plugin.set({ key: TOKEN_KEY, value }); },
    remove: async () => { await plugin.remove({ key: TOKEN_KEY }); },
  };
};

/**
 * 안전 저장소. 셸이 싣지 않았으면 null.
 *
 * **없는 키를 오류로 알리는 플러그인이 많다.** 키체인 API 가 그렇게 생겼고, 감싸는
 * 플러그인들도 대개 그대로 던진다. 여기서는 "없음" 과 "고장" 을 가리지 않고 없음으로
 * 본다 — 가린다고 할 수 있는 일이 다르지 않고(둘 다 로그인 화면이다), 가리려 들면
 * 플러그인마다 다른 오류 모양에 코드가 매인다.
 */
const secureStore = (): TokenStore | null => {
  const plugin = bridge()?.Plugins?.SecureStorage;
  if (!plugin) return null;
  return {
    get: async () => {
      try {
        return (await plugin.get({ key: TOKEN_KEY })).value ?? null;
      } catch {
        return null;
      }
    },
    set: async (value) => { await plugin.set({ key: TOKEN_KEY, value }); },
    remove: async () => {
      try {
        await plugin.remove({ key: TOKEN_KEY });
      } catch {
        // 없는 것을 지우라는 요청은 이룬 셈이다
      }
    },
  };
};

/**
 * 저장해 둔 토큰을 메모리로 올린다. 앱이 뜰 때 한 번 부른다.
 *
 * 셸 밖이면 아무 일도 하지 않는다 — 웹은 쿠키로 붙으므로 토큰이 필요 없다.
 */
export async function hydrateSessionToken(): Promise<string | null> {
  if (!isNativeShell()) return null;
  const safe = secureStore();
  try {
    if (safe === null) {
      cached = (await plainStore()?.get()) ?? null;
      return cached;
    }

    cached = await safe.get();
    if (cached !== null) return cached;

    /*
     * **옛 자리에 있던 것을 한 번 옮긴다.** 안전 저장소가 생긴 뒤에도 이미 로그인해 둔
     * 사람의 토큰은 평문 자리에 있다. 옮기지 않으면 그 사람들은 앱을 켤 때 로그아웃되고,
     * 평문 사본은 그대로 남는다 — 가장 나쁜 쪽이다.
     *
     * 메모리를 **먼저** 채운다. 옮기다 실패해도 이번 실행에서는 로그인이 유지되고,
     * 다음 실행에 다시 옮겨 본다. 옮기기 전에 옛 자리를 지우는 일은 없다.
     */
    const legacy = (await plainStore()?.get()) ?? null;
    if (legacy === null) return null;
    cached = legacy;
    try {
      await safe.set(legacy);
      await plainStore()?.remove();
    } catch {
      // 다음 실행에 다시 옮긴다. 평문 사본은 아직 거기 있어야 한다.
    }
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
  const safe = secureStore();
  try {
    await (safe ?? plainStore())?.set(token);
    // 안전 저장소에 넣었으면 평문 자리에 사본을 남기지 않는다
    if (safe !== null) await plainStore()?.remove();
  } catch {
    // 다음 실행에 다시 로그인하게 된다. 지금 동작을 막지는 않는다.
  }
}

/**
 * 로그아웃. 메모리와 저장소에서 지운다.
 *
 * **저장소 두 자리를 다 지운다.** 안전 저장소로 옮기기 전에 로그인해 둔 사람은 평문 자리에
 * 토큰이 있는데, 지금 쓰는 자리만 지우면 그 사본이 로그아웃 뒤에도 남는다 — 그리고 그
 * 글자는 서버 세션이 끊길 때까지 실제로 쓸 수 있는 값이다.
 */
export async function clearSessionToken(): Promise<void> {
  cached = null;
  if (!isNativeShell()) return;
  for (const target of [secureStore(), plainStore()]) {
    try {
      await target?.remove();
    } catch {
      // 메모리에서는 이미 지웠다. 다음 실행에 남은 토큰은 서버가 거절한다.
    }
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
