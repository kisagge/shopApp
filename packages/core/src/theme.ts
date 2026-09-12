/**
 * 화면 밝기 고르기.
 *
 * **셋이다 — 시스템·밝게·어둡게.** 둘로 만들면 "OS 를 따른다" 를 표현할
 * 방법이 없어서, 한 번 고른 사람은 다시는 OS 설정을 따라갈 수 없다. 저녁에
 * 어두워지는 기기를 쓰는 사람에게 그것은 기능이 아니라 함정이다.
 *
 * **고른 값을 계정에 저장하지 않는다.** 언어는 저장한다 — 메일을 보낼 때
 * 읽어야 하는데 그때는 요청도 쿠키도 없기 때문이다. 밝기는 메일에도 영수증에도
 * 쓰이지 않고, 오히려 기기마다 다른 것이 자연스럽다(낮의 데스크톱과 밤의
 * 휴대폰). 그래서 쿠키 하나로 끝낸다.
 */

export const THEMES = ['system', 'light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

/**
 * 쿠키 이름.
 *
 * 언어와 같은 `shop.` 앞가지를 쓴다. 같은 도메인에 다른 것이 붙어도 섞이지
 * 않고, 개발자 도구에서 우리 것만 골라 볼 수 있다.
 */
export const THEME_COOKIE = 'shop.theme';

/** 쿠키와 폼에서 오는 값은 아무거나일 수 있다. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * `<html data-theme>` 에 박을 값.
 *
 * **시스템일 때는 아무것도 안 박는다.** `data-theme="system"` 같은 값을 박으면
 * CSS 가 그것도 알아야 하고, 무엇보다 `:root:not([data-theme="light"])` 안에서
 * OS 설정을 따르는 길이 하나 더 갈린다. 없는 것이 곧 "OS 를 따른다" 다.
 */
export function themeAttribute(theme: Theme): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}
