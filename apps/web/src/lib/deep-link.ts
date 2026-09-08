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
