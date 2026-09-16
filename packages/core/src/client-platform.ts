/**
 * 어디서 들어온 방문인가 — 브라우저인가, 앱 웹뷰인가.
 *
 * **이것 없이는 앱이 느린지 아닌지를 말할 수 없다.** 실사용자 성능(web-vitals)은
 * 이미 모으고 있지만, 이벤트에 붙는 구분은 UA 에서 뽑은 기기 종류(mobile ·
 * tablet · desktop)뿐이다. 앱 웹뷰는 모바일 브라우저와 같은 칸에 들어간다.
 *
 * 둘은 같지 않다. 앱은 켤 때마다 웹뷰를 차게 띄우고, 브라우저가 쥐고 있는 것들을
 * 하나도 물려받지 못한다 — 따뜻한 연결도, 이전 방문의 캐시도 없다. 그 값이
 * 모바일 웹 숫자에 섞이면 둘 다 뿌옇게 된다.
 *
 * 값은 Capacitor 가 웹뷰에 주입해 주는 것과 같은 말을 쓴다(@shop/native 의
 * nativePlatform). 셸 밖에서는 'web'.
 */
export const CLIENT_PLATFORM = ['web', 'ios', 'android'] as const;
export type ClientPlatform = (typeof CLIENT_PLATFORM)[number];

/** 운영 화면은 한국어다 — 사전이 아니라 여기에 둔다(다른 운영 라벨과 같은 자리). */
export const CLIENT_PLATFORM_LABEL: Record<ClientPlatform, string> = {
  web: '웹',
  ios: 'iOS 앱',
  android: '안드로이드 앱',
};

export const isClientPlatform = (value: unknown): value is ClientPlatform =>
  typeof value === 'string' && (CLIENT_PLATFORM as readonly string[]).includes(value);

/**
 * 셸이 말한 값을 우리가 아는 말로 좁힌다.
 *
 * **모르는 값은 'web' 으로 접지 않고 버린다.** Capacitor 가 언젠가 'electron'
 * 같은 것을 돌려주면 그건 웹이 아닌데, 웹으로 적어 두면 웹 숫자가 조용히
 * 틀어진다. 아무것도 아닌 것으로 두면 최소한 "모른다" 가 남는다.
 */
export function toClientPlatform(value: unknown): ClientPlatform | null {
  return isClientPlatform(value) ? value : null;
}
