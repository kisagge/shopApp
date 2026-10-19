import 'server-only';

/**
 * 앱과 이 도메인을 맺어 주는 값들.
 *
 * **두 파일 다 값이 없으면 아예 내보내지 않는다.** 자리만 채운 파일을
 * 올리면 애플과 구글이 그것을 받아 가 캐시하고, 나중에 진짜 값을 넣어도
 * 한동안 옛것으로 판단한다. 없는 것이 틀린 것보다 낫다.
 *
 * 값은 사람이 넣어야 하는 종류다 — 애플 팀 ID 는 유료 개발자 계정에서,
 * 안드로이드 지문은 서명 키에서 나온다. 그래서 코드에 박지 않고 환경으로
 * 받는다.
 */

/**
 * 앱으로 보낼 길.
 *
 * 공유되는 주소들이다 — 매대와 상품, 그리고 첫 화면. `/` 는 그 자리 하나뿐이고
 * 나머지는 그 아래 전부다.
 *
 * **이 목록이 두 곳에 적혀 있었다.** iOS 는 이 서버가 만들어 주는 문서로
 * 받고(아래 라우트), 안드로이드는 앱 안의 AndroidManifest 로 받는다.
 * 한쪽만 고치면 두 기기가 다르게 행동하는데, 그건 둘 다 꺼내 보지 않으면
 * 모른다 — 앱 링크가 안 걸릴 때 안드로이드는 **조용히 브라우저로** 간다.
 */
export const DEEP_LINK_PATHS = ['/product/', '/category/', '/brand/', '/collection/', '/'] as const;

/**
 * 앱이 가로채면 안 되는 길.
 *
 * **결제사가 돌려보내는 주소까지 앱이 먹으면 승인 흐름이 끊긴다.** 창구도
 * 같다 — 소셜 로그인은 `/api/auth/...` 로 돌아오는데, 그것을 앱이 받아 가면
 * 주소는 라우터 이동으로 바뀌고 세션 쿠키는 영영 안 구워진다. 로그인이
 * 끝나지 않는 것으로 보인다.
 *
 * iOS 문서에는 이 규칙이 처음부터 있었고, **안드로이드에는 없었다** —
 * 호스트만 적어 둔 intent-filter 는 그 도메인의 모든 길을 가져간다.
 */
export const DEEP_LINK_BLOCKED = ['/api/', '/checkout/'] as const;

/** 셸의 appId 와 같아야 한다 (apps/mobile 의 capacitor.config) */
export const APP_ID = 'test.plain.shop';

export const appleTeamId = (): string | null => process.env['APPLE_TEAM_ID']?.trim() || null;

/**
 * 서명 인증서의 SHA-256 지문.
 *
 * 콜론으로 끊긴 대문자 16진수 32쌍이다. 여러 개를 쉼표로 줄 수 있다 —
 * 디버그 키와 배포 키가 다르고, 구글 플레이가 다시 서명하면 또 달라진다.
 */
export const androidFingerprints = (): string[] =>
  (process.env['ANDROID_CERT_SHA256'] ?? '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v));
