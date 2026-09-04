/**
 * 어떤 말로 보여 줄지 정한다.
 *
 * **웹과 앱이 같은 길을 쓴다.** 웹뷰는 기기 언어를 그대로 Accept-Language 에
 * 실어 보낸다 — iOS 도 안드로이드도 그렇다. 그래서 "웹은 브라우저 언어, 앱은
 * 기기 언어" 라는 요구가 헤더 하나로 동시에 풀린다. 네이티브 쪽에 언어를
 * 물어보는 다리를 따로 놓지 않는 이유다. 다리를 놓으면 첫 화면이 서버에서
 * 그려질 때는 아직 그 값을 모르므로, 한국어로 그린 뒤 깜빡이며 바뀐다.
 */

export const LOCALES = ['ko', 'en', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];

/** 고르지 못했을 때 쓰는 말. 이 가게는 한국 가게다. */
export const DEFAULT_LOCALE: Locale = 'ko';

/** 사용자가 직접 고른 말을 담아 두는 쿠키 */
export const LOCALE_COOKIE = 'shop.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** 화면에 띄울 이름. **그 말 자체로 적는다** — 영어를 못 읽는 사람도 찾을 수 있어야 한다. */
export const LOCALE_LABEL: Record<Locale, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
};

/** `<html lang>` 과 Intl 에 넘길 BCP 47 태그 */
export const LOCALE_TAG: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
  ja: 'ja-JP',
};

/** OpenGraph 의 og:locale */
export const OG_LOCALE: Record<Locale, string> = {
  ko: 'ko_KR',
  en: 'en_US',
  ja: 'ja_JP',
};

interface Ranked {
  readonly tag: string;
  readonly q: number;
}

/**
 * Accept-Language 를 품질값 순으로 푼다.
 *
 * `ko;q=0.9` 처럼 순서와 무관하게 선호도가 붙어 오므로 **앞에서 하나만
 * 잘라 쓰면 안 된다.** 실제로 크롬은 `ja,en-US;q=0.9,en;q=0.8` 처럼 보내고,
 * 이 문자열에서 앞만 보면 맞지만 `en-US,ja;q=0.9` 는 틀린다.
 */
function rank(header: string): Ranked[] {
  return header
    .split(',')
    .map((part): Ranked | null => {
      const [tag, ...params] = part.trim().split(';');
      if (!tag) return null;
      const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
      // 잘못된 q 는 0 으로 본다. NaN 을 그대로 두면 정렬이 뒤집힌다.
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((r): r is Ranked => r !== null && r.q > 0)
    .sort((a, b) => b.q - a.q);
}

/**
 * 헤더가 원하는 말 중 우리가 가진 것을 고른다. 없으면 null.
 *
 * `ja-JP` 는 `ja` 로 맞춘다 — 지역까지 정확히 같은 태그만 받으면 대부분의
 * 실제 브라우저가 걸러진다. `*` 는 "아무거나" 라는 뜻이라 무시한다:
 * 그것으로 기본값이 정해지는 것은 협상이 아니다.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  for (const { tag } of rank(acceptLanguage)) {
    if (tag === '*') continue;
    const base = tag.split('-')[0];
    const hit = LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return null;
}

/**
 * 이번 요청에 쓸 말을 정한다.
 *
 * **고른 적이 있으면 그것이 이긴다.** 브라우저가 일본어라도 사용자가 한국어를
 * 골랐다면 한국어다 — 매번 다시 추측하면 고르는 버튼이 있으나 마나다.
 * 쿠키 값은 사용자가 고칠 수 있으므로 아는 값인지 확인하고 쓴다.
 */
export function resolveLocale(input: {
  readonly cookie?: string | null | undefined;
  readonly acceptLanguage?: string | null | undefined;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return negotiateLocale(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
