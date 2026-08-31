const KEY = 'shop.consent.analytics';

/**
 * 분석 수집 동의.
 *
 * 기본값을 **true** 로 둔다. 우리가 남기는 것은 익명 식별자, 해시된 IP,
 * 기기 종류 세 갈래뿐이고 제3자로 나가지 않는다. 대신 **거부는 즉시 존중**하고,
 * 로그인한 사용자는 계정에 저장된 값(User.analyticsConsent)이 우선한다.
 *
 * 제3자 도구(PostHog·GA4)를 붙이는 순간 이 기본값은 false 로 뒤집어야 한다.
 * 그때는 동의 배너가 먼저다.
 */
export const DEFAULT_ANALYTICS_CONSENT = true;

export function getLocalConsent(): boolean {
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === null) return DEFAULT_ANALYTICS_CONSENT;
    return v === 'true';
  } catch {
    return DEFAULT_ANALYTICS_CONSENT;
  }
}

export function setLocalConsent(granted: boolean): void {
  try {
    window.localStorage.setItem(KEY, String(granted));
  } catch {
    /* 저장 못 하면 이번 세션에만 적용된다 */
  }
}
