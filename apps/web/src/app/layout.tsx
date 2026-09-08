import type { Metadata, Viewport } from 'next';
import { LOCALE_TAG, OG_LOCALE } from '@shop/i18n';
import { Hahmlet, IBM_Plex_Sans_KR } from 'next/font/google';
import './globals.css';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { WebVitalsReporter } from '~/components/web-vitals-reporter';
import { CartSync } from '~/components/cart-sync';
import { NativeSession } from '~/components/native-session';
import { NativeSplash } from '~/components/native-splash';
import { NativeDeepLink } from '~/components/native-deep-link';
import { ServiceWorker } from '~/components/service-worker';
import { SiteHeader } from '~/components/site-header';
import { SiteFooter } from '~/components/site-footer';
import { Providers } from '~/components/providers';
import { absoluteUrl } from '~/lib/urls';
import { getLocale, getT } from '~/lib/i18n/server';
import { LocaleProvider } from '~/lib/i18n/client';

/**
 * 굵기는 **실제로 쓰는 것만** 부른다.
 *
 * 한글 글꼴은 글자가 많아 수백 개 조각으로 쪼개져 오고, 굵기마다 그 조각
 * 전부에 @font-face 선언이 하나씩 붙는다. 그래서 굵기 하나가 곧 CSS 수십
 * KB 다 — 다섯 굵기를 부르던 본문 글꼴의 선언만 232KB 였고, 그 CSS 는 글자가
 * 그려지기 전에 받아야 한다.
 *
 * 세어 보니 300(light)은 **한 곳도 쓰지 않았고**, 700(bold)은 배지 두 곳뿐이라
 * 600 으로 맞췄다. 세리프는 워드마크와 큰 제목에만 쓰는데 전부 500 이었다.
 *
 * 굵기를 새로 쓰려면 여기 한 줄을 더해야 한다. 그 한 줄이 수십 KB 라는 것을
 * 알고 더하는 편이 낫다.
 *
 * **미리 받지 않는다(preload: false).** 굵기를 줄여도 조각 수는 그대로였다.
 * 재 보니 매대 한 화면이 글꼴 파일 208개 1,833KB 를 받고 있었는데, 그 화면이
 * 실제로 쓰는 것은 **35개 334KB** 였다 — 나머지 173개는 화면에 없는 글자의
 * 조각이다.
 *
 * 미리 받기를 켜 두면 `<link rel=preload>` 155줄이 그 전부를 가장 높은
 * 우선순위로 끌어온다. 사진과 스크립트가 그 뒤에 줄을 선다. 끄면 브라우저가
 * @font-face 의 unicode-range 를 보고 **필요한 조각만** 가져간다.
 *
 * 글자가 안 보이는 시간은 생기지 않는다 — display: 'swap' 이라 대체 글꼴로
 * 먼저 그리고, next/font 가 크기를 맞춘 대체본을 만들어 두므로 바뀔 때
 * 레이아웃도 튀지 않는다.
 */
const sans = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-kr',
  display: 'swap',
  preload: false,
});

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
  const [locale, t] = await Promise.all([getLocale(), getT()]);

  return (
    /* lang 이 틀리면 낭독기가 한국어를 영어 발음으로 읽는다 */
    <html lang={LOCALE_TAG[locale]} className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--bg)]"
        >
          {t('nav.skipToContent')}
        </a>
        <LocaleProvider locale={locale}>
          <Providers>
            <div className="flex min-h-dvh flex-col">
              <SiteHeader />
              <main id="main" className="flex-1">
                {children}
              </main>
              <SiteFooter />
            </div>
            <AnalyticsProvider />
            {/* 실사용자 성능. 같은 파이프라인으로 나간다. */}
            <WebVitalsReporter />
            {/* 로그인하면 장바구니를 서버와 맞춘다. 비로그인은 아무것도 하지 않는다. */}
            <CartSync />
            {/* 네이티브 셸에서만 — 저장해 둔 세션 토큰을 올린다 */}
            <NativeSession />
            <NativeSplash />
            <NativeDeepLink />
            <ServiceWorker />
          </Providers>
        </LocaleProvider>
      </body>
    </html>
  );
}
