'use client';

import { useSyncExternalStore } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_TAG,
  resolveLocale,
  type Locale,
} from '@shop/i18n/locale';

/**
 * 루트 레이아웃까지 깨졌을 때.
 *
 * 이 경계는 <html> 과 <body> 를 **직접** 그려야 한다 — 레이아웃이 살아 있지
 * 않은 상황이라 평소의 껍데기를 기대할 수 없다.
 *
 * 그래서 여기서는 프로젝트의 CSS 도 폰트도 없다고 봐야 한다. 인라인 스타일과
 * 시스템 글꼴만 쓴다. 오프라인 화면(apps/mobile/www)과 같은 이유다.
 */

/**
 * 문구를 사전에서 가져오지 않고 여기 둔다.
 *
 * 사전은 세 벌 합쳐 2,400줄이고, `@shop/i18n` 은 진입점이 하나라 문구 하나를
 * 가져오려면 **그 전부가 딸려 온다.** 계약에서 상수를 가져왔다가 Zod 384KB 가
 * 따라온 것과 같은 자리다.
 *
 * 게다가 여기는 **앱이 깨졌을 때 마지막으로 뜨는 화면**이다. 이 화면이 큰
 * 모듈에 기대면 그 모듈이 깨진 원인일 때 같이 무너진다. 네 줄을 옮겨 적는
 * 편이 낫다.
 *
 * 대신 `Record<Locale, …>` 로 묶어 **말을 하나 더하면 컴파일이 깨지게** 했다.
 * 사전 쪽 ko.ts 가 열쇠 목록의 근거인 것과 같은 방식이다.
 */
const TEXT: Record<Locale, { title: string; hint: string; code: string; home: string }> = {
  ko: {
    title: '문제가 발생했습니다',
    hint: '잠시 후 다시 시도해 주세요.',
    code: '오류 번호',
    home: '처음으로',
  },
  en: {
    title: 'Something went wrong',
    hint: 'Please try again in a moment.',
    code: 'Error ID',
    home: 'Go to home',
  },
  ja: {
    title: '問題が発生しました',
    hint: 'しばらくしてからもう一度お試しください。',
    code: 'エラー番号',
    home: 'ホームへ',
  },
};

/** 이 화면이 쓸 말을 지금 이 자리에서 고른다 */
function pickLocale(): Locale {
  return resolveLocale({
    // 사용자가 고른 적이 있으면 그것이 이긴다 — 평소 화면과 같은 규칙이다
    cookie: cookieLocale(),
    // navigator.languages 는 이미 선호 순서다. 쉼표로 이으면 그대로 협상된다.
    acceptLanguage: navigator.languages.join(','),
  });
}

/** 한 번 정해지면 바뀌지 않는다 — 구독할 것이 없다 */
const never = (): (() => void) => () => {};

function cookieLocale(): string | null {
  const hit = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`));
  if (!hit) return null;
  const value = hit.slice(LOCALE_COOKIE.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    // 손으로 고친 쿠키는 %  하나만 들어가도 던진다. 못 읽으면 없는 것으로 본다.
    return null;
  }
}

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  /*
   * **서버와 브라우저가 서로 다른 값을 쓰는 자리다.**
   *
   * 이 화면은 서버에서 그려질 때도 있는데 그때는 기기 언어를 알 방법이 없다.
   * 요청의 언어를 실어다 줄 레이아웃도 없다 — 그 레이아웃이 깨져서 이 화면이
   * 뜬 것이다. 그래서 서버는 기본 말로 그리고 브라우저가 다시 고른다.
   *
   * 붙고 나서 상태를 바꾸는 방식으로 짰더니 **효과 안에서 상태를 바꾼다고
   * lint 가 걸렀다** — 그리고 그 지적이 맞다. 그건 한 번 그린 뒤 다시 그리는
   * 것이고, 이 경우는 애초에 "서버 값과 브라우저 값이 다르다" 는 뜻이라
   * useSyncExternalStore 가 그 자리다. 마지막 인자가 서버 값이다.
   */
  const locale = useSyncExternalStore(never, pickLocale, () => DEFAULT_LOCALE);

  const t = TEXT[locale];

  return (
    <html lang={LOCALE_TAG[locale]}>
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          background: '#fdfcfa',
          color: '#2b2926',
          font: "15px/1.7 -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 340, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 19, fontWeight: 600, letterSpacing: '0.16em' }}>PLAIN</p>
          <h1 style={{ margin: '18px 0 10px', fontSize: 19, fontWeight: 600 }}>{t.title}</h1>
          <p style={{ margin: 0, fontSize: 14, color: '#6f6a63' }}>{t.hint}</p>
          {error.digest && (
            <p style={{ marginTop: 18, fontSize: 12, color: '#9a958d' }}>
              {t.code} {error.digest}
            </p>
          )}
          <p style={{ marginTop: 24 }}>
            <a href="/" style={{ color: '#2b2926', fontSize: 14 }}>
              {t.home}
            </a>
          </p>
        </main>
      </body>
    </html>
  );
}
