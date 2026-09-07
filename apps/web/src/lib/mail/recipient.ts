import 'server-only';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@shop/i18n';

/**
 * 받는 사람의 말.
 *
 * **DB 에 담긴 문자열을 그대로 믿지 않는다.** 계정의 말은 사용자가 고른
 * 값이고, 지원 목록은 나중에 바뀔 수 있다 — 지웠던 말이 남아 있는 행을
 * 그대로 번역기에 넘기면 열쇠가 그대로 찍힌 메일이 나간다.
 *
 * null 은 "고른 적 없음" 이다. 그때는 기본 말로 보낸다 — 못 고른 채 아무것도
 * 안 보내는 것보다 한 말로라도 가는 편이 낫다.
 */
export function localeOf(stored: string | null | undefined): Locale {
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}
