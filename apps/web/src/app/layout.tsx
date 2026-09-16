import type { Metadata, Viewport } from 'next';
import { LOCALE_TAG, OG_LOCALE } from '@shop/i18n';
import { Hahmlet } from 'next/font/google';
import './globals.css';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { WebVitalsReporter } from '~/components/web-vitals-reporter';
import { ErrorReporter } from '~/components/error-reporter';
import { CartSync } from '~/components/cart-sync';
import { NativeSession } from '~/components/native-session';
import { NativeSplash } from '~/components/native-splash';
import { NativeDeepLink } from '~/components/native-deep-link';
import { NativeBackButton } from '~/components/native-back-button';
import { ServiceWorker } from '~/components/service-worker';
import { Providers } from '~/components/providers';
import { absoluteUrl } from '~/lib/urls';
import { getDictionary, getLocale, getT } from '~/lib/i18n/server';
import { getViewer } from '~/lib/viewer';
import { getTheme } from '~/lib/theme';
import { themeAttribute } from '@shop/core';
import { LocaleProvider } from '~/lib/i18n/client';

/**
 * **웹폰트는 세리프 하나뿐이다.**
 *
 * 본문 한글은 기기의 글꼴을 쓴다 — 이유와 측정값은
 * `packages/ui/src/styles/theme.css` 의 --font-sans 에 적었다. 요약하면,
 * 한글 웹폰트는 굵기 하나가 unicode-range 조각 94개라 굵기 셋이면
 * `@font-face` 선언이 283개고, 그 선언들이 든 스타일이 **그리기를 막아**
 * 폰에서 첫 그림이 3.2초였다.
 *
 * 세리프는 남긴다. 워드마크와 큰 제목에만 쓰이고 이 가게의 인상을 지고
 * 있는 것이 그쪽이며, 굵기가 하나라 값이 3분의 1이다.
 *
 * **미리 받지 않는다(preload: false).** 미리 받기를 켜 두면
 * `<link rel=preload>` 가 조각 전부를 가장 높은 우선순위로 끌어오고
 * 사진과 스크립트가 그 뒤에 줄을 선다. 끄면 브라우저가 unicode-range 를
 * 보고 **필요한 조각만** 가져간다.
 *
 * 글자가 안 보이는 시간은 생기지 않는다 — display: 'swap' 이라 대체 글꼴로
 * 먼저 그리고, next/font 가 크기를 맞춘 대체본을 만들어 두므로 바뀔 때
 * 레이아웃도 튀지 않는다.
 */
const serif = Hahmlet({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-hahmlet',
  display: 'swap',
  preload: false,
});

const DESCRIPTION = '오래 두고 입을 것만 골라 담은 편집숍';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    /**
     * 상대 주소를 절대 주소로 바꿀 기준.
     *
     * 이게 없으면 openGraph 이미지가 상대 경로로 나가고, 카카오톡·슬랙 같은
     * 곳은 그걸 불러오지 못해 **링크를 붙여도 미리보기가 뜨지 않는다.**
     */
    metadataBase: new URL(absoluteUrl('/')),
    title: { default: 'PLAIN', template: '%s | PLAIN' },
    description: DESCRIPTION,
    openGraph: {
      type: 'website',
      siteName: 'PLAIN',
      locale: OG_LOCALE[locale],
      title: 'PLAIN',
      description: DESCRIPTION,
    },
  };
}

/** 상태바 색. 테마 CSS 의 `--color-n-0` · `--color-dark-bg` 와 같은 값이다. */
const THEME_COLOR = { light: '#FEFDFC', dark: '#100E0B' } as const;

/**
 * **상태바도 고른 밝기를 따라간다.**
 *
 * 휴대폰에서 이 값이 헤더 위 상태바 바탕이 된다. 미디어 쿼리 두 줄로만 두면
 * OS 가 밝은데 사람이 어둡게 고른 경우 — 화면은 검은데 그 위 상태바만 흰
 * 띠로 남는다. 앱 셸에서 특히 눈에 띈다.
 *
 * 고른 적이 없을 때만 OS 에 맡긴다.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await getTheme();

  return {
    // Capacitor 웹뷰에서 safe-area-inset이 동작하려면 viewport-fit=cover가 필요하다
    viewportFit: 'cover',
    width: 'device-width',
    initialScale: 1,
    // 사용자가 확대할 수 있어야 한다 — maximumScale로 막지 않는다
    themeColor:
      theme === 'system'
        ? [
            { media: '(prefers-color-scheme: light)', color: THEME_COLOR.light },
            { media: '(prefers-color-scheme: dark)', color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t, dict, viewer, theme] = await Promise.all([
    getLocale(), getT(), getDictionary(), getViewer(), getTheme(),
  ]);

  return (
    /* lang 이 틀리면 낭독기가 한국어를 영어 발음으로 읽는다 */
    <html
      lang={LOCALE_TAG[locale]}
      className={serif.variable}
      /*
       * 고른 적이 없으면 아예 안 붙는다 — 없는 것이 곧 "OS 를 따른다" 다.
       * CSS 쪽 이유는 `@shop/core` 의 theme.ts 에 적었다.
       */
      data-theme={themeAttribute(theme)}
    >
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--bg)]"
        >
          {t('nav.skipToContent')}
        </a>
        <LocaleProvider locale={locale} dict={dict}>
          <Providers>
            {/*
              **머리와 발은 여기서 그리지 않는다.** 그러면 `/admin` 아래에도
              그대로 붙는다 — 주문 표 밑에 카테고리 목록과 입점 신청 링크가
              달려 있었다. 매장 화면은 `(shop)` 그룹의 레이아웃이, 운영 화면은
              `/admin` 의 레이아웃이 각자 두른다.

              이 레이아웃에 남는 것은 **어느 쪽에나 필요한 것들**이다 — 말과
              테마, 건너뛰기 링크, 기록과 네이티브 셸.
            */}
            {children}
            <AnalyticsProvider />
            {/* 실사용자 성능. 같은 파이프라인으로 나간다. */}
            <WebVitalsReporter />
            {/*
              브라우저에서 터진 오류를 서버로 보낸다. 앱(웹뷰)에서는 이것이 유일한 길이다 —
              개발자 도구도 없고 배포 로그에도 안 남는다.
            */}
            <ErrorReporter />
            {/* 로그인하면 장바구니를 서버와 맞춘다. 비로그인은 아무것도 하지 않는다. */}
            <CartSync userId={viewer?.id ?? null} />
            {/* 네이티브 셸에서만 — 저장해 둔 토큰으로 서버 세션까지 되살린다 */}
            <NativeSession signedIn={viewer !== null} />
            <NativeSplash />
            <NativeDeepLink />
            <NativeBackButton />
            <ServiceWorker />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
