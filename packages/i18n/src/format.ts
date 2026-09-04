import type { Locale } from './locale';
import { LOCALE_TAG } from './locale';

/**
 * 값 서식.
 *
 * **환율은 다루지 않는다.** 이 가게는 원화로만 판다 — 영어로 본다고 달러가
 * 되지는 않는다. 통화를 바꾸려면 환율 출처와 그 값을 언제 고정하는지(장바구니?
 * 결제 시점?)를 정해야 하고, 그것은 번역이 아니라 정산 문제다. 그래서 숫자는
 * 그대로 두고 **읽는 방식만** 그 나라 식으로 바꾼다.
 */

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

function numberFormat(key: string, locale: Locale, options: Intl.NumberFormatOptions) {
  const id = `n:${key}:${locale}`;
  let f = cache.get(id) as Intl.NumberFormat | undefined;
  if (!f) {
    f = new Intl.NumberFormat(LOCALE_TAG[locale], options);
    cache.set(id, f);
  }
  return f;
}

/**
 * 금액.
 *
 * 한국어는 `413,000원`, 나머지는 `₩413,000` 이다. 한국 가격표에 ₩ 기호는
 * 잘 붙지 않고, 반대로 영어·일본어 화면에서 `원` 은 읽히지 않는다.
 * 원 단위 통화라 소수점은 어느 쪽에도 붙이지 않는다.
 */
export function formatMoney(locale: Locale, won: number): string {
  if (locale === 'ko') return `${numberFormat('plain', 'ko', {}).format(won)}원`;
  return numberFormat('krw', locale, {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(won);
}

/**
 * 금액을 기호·숫자·단위로 쪼갠다.
 *
 * 화면에서 **단위만 작게** 그리기 때문이다 — `413,000원` 의 '원' 은 숫자보다
 * 작다. 한 덩어리 문자열로 만들면 그 styling 을 되살릴 수 없고, 그렇다고
 * 화면 쪽에서 문자열을 다시 자르면 언어별 규칙이 두 군데로 흩어진다.
 */
export function moneyParts(
  locale: Locale,
  won: number,
): { readonly prefix: string; readonly number: string; readonly suffix: string } {
  if (locale === 'ko') return { prefix: '', number: formatNumber('ko', won), suffix: '원' };
  return { prefix: '₩', number: formatNumber(locale, won), suffix: '' };
}

export function formatNumber(locale: Locale, value: number): string {
  return numberFormat('plain', locale, {}).format(value);
}

export function formatPercent(locale: Locale, value: number): string {
  return numberFormat('pct', locale, { style: 'percent', maximumFractionDigits: 1 }).format(
    value / 100,
  );
}

function dateFormat(key: string, locale: Locale, options: Intl.DateTimeFormatOptions) {
  const id = `d:${key}:${locale}`;
  let f = cache.get(id) as Intl.DateTimeFormat | undefined;
  if (!f) {
    /**
     * **시간대를 서울로 못 박는다.** 서버는 UTC 로 돌고 브라우저는 사용자
     * 시간대를 쓰므로, 두지 않으면 같은 주문의 날짜가 서버에서 그린 것과
     * 브라우저에서 그린 것이 하루 어긋나 하이드레이션이 깨진다. 파는 곳이
     * 한국이니 주문 시각도 한국 시각으로 읽는 것이 맞다.
     */
    f = new Intl.DateTimeFormat(LOCALE_TAG[locale], { timeZone: 'Asia/Seoul', ...options });
    cache.set(id, f);
  }
  return f;
}

export function formatDate(locale: Locale, date: Date | string | number): string {
  return dateFormat('date', locale, { dateStyle: 'medium' }).format(new Date(date));
}

export function formatDateTime(locale: Locale, date: Date | string | number): string {
  return dateFormat('datetime', locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(date),
  );
}
