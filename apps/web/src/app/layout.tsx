import type { Metadata, Viewport } from 'next';
import { LOCALE_TAG, OG_LOCALE } from '@shop/i18n';
import { Hahmlet } from 'next/font/google';
import './globals.css';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { WebVitalsReporter } from '~/components/web-vitals-reporter';
import { CartSync } from '~/components/cart-sync';
import { NativeSession } from '~/components/native-session';
import { NativeSplash } from '~/components/native-splash';
import { NativeDeepLink } from '~/components/native-deep-link';
import { NativeBackButton } from '~/components/native-back-button';
import { ServiceWorker } from '~/components/service-worker';
import { SiteHeader } from '~/components/site-header';
import { SiteFooter } from '~/components/site-footer';
import { Providers } from '~/components/providers';
import { absoluteUrl } from '~/lib/urls';
import { getDictionary, getLocale, getT } from '~/lib/i18n/server';
import { getViewer } from '~/lib/viewer';
import { LocaleProvider } from '~/lib/i18n/client';
import { CompareTray } from '~/components/compare-tray';

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

export const viewport: Viewport = {
  // Capacitor 웹뷰에서 safe-area-inset이 동작하려면 viewport-fit=cover가 필요하다
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  // 사용자가 확대할 수 있어야 한다 — maximumScale로 막지 않는다
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FEFDFC' },
    { media: '(prefers-color-scheme: dark)', color: '#100E0B' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, t, dict, viewer] = await Promise.all([
    getLocale(), getT(), getDictionary(), getViewer(),
  ]);

  return (
    /* lang 이 틀리면 낭독기가 한국어를 영어 발음으로 읽는다 */
    <html lang={LOCALE_TAG[locale]} className={serif.variable}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--bg)]"
        >
          {t('nav.skipToContent')}
        </a>
        <LocaleProvider locale={locale} dict={dict}>
          <Providers>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              {/*
                * tabIndex 가 없으면 건너뛰기 링크가 주소만 바꾸고 **초점은
                * body 로 사라진다.** Chrome 은 다음 Tab 을 본문에서 이어 주지만
                * 초점이 없으니 낭독기는 본문에 왔다고 말하지 않고, 그 이어주기가
                * 없는 브라우저에서는 링크가 아무 일도 하지 않는다.
                */}
              <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
                {children}
              </main>
              <SiteFooter />
            </div>
            {/* 담아 둔 것이 없으면 아무것도 그리지 않는다 */}
            <CompareTray />
            <AnalyticsProvider />
            {/* 실사용자 성능. 같은 파이프라인으로 나간다. */}
            <WebVitalsReporter />
            {/* 로그인하면 장바구니를 서버와 맞춘다. 비로그인은 아무것도 하지 않는다. */}
            <CartSync userId={viewer?.id ?? null} />
            {/* 네이티브 셸에서만 — 저장해 둔 세션 토큰을 올린다 */}
            <NativeSession />
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
