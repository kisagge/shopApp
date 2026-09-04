import type { Metadata, Viewport } from 'next';
import { Hahmlet, IBM_Plex_Sans_KR } from 'next/font/google';
import './globals.css';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { CartSync } from '~/components/cart-sync';
import { NativeSession } from '~/components/native-session';
import { SiteHeader } from '~/components/site-header';
import { SiteFooter } from '~/components/site-footer';
import { Providers } from '~/components/providers';
import { absoluteUrl } from '~/lib/urls';

const sans = IBM_Plex_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-kr',
  display: 'swap',
});

const serif = Hahmlet({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-hahmlet',
  display: 'swap',
});

const DESCRIPTION = '오래 두고 입을 것만 골라 담은 편집숍';

export const metadata: Metadata = {
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
    locale: 'ko_KR',
    title: 'PLAIN',
    description: DESCRIPTION,
  },
};

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-[var(--brand)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--bg)]"
        >
          본문 바로가기
        </a>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </div>
          <AnalyticsProvider />
          {/* 로그인하면 장바구니를 서버와 맞춘다. 비로그인은 아무것도 하지 않는다. */}
          <CartSync />
          {/* 네이티브 셸에서만 — 저장해 둔 세션 토큰을 올린다 */}
          <NativeSession />
        </Providers>
      </body>
    </html>
  );
}
