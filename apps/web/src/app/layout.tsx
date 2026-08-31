import type { Metadata, Viewport } from 'next';
import { Hahmlet, IBM_Plex_Sans_KR } from 'next/font/google';
import './globals.css';
import { AnalyticsProvider } from '~/components/analytics-provider';
import { SiteHeader } from '~/components/site-header';
import { SiteFooter } from '~/components/site-footer';

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

export const metadata: Metadata = {
  title: { default: 'PLAIN', template: '%s | PLAIN' },
  description: '오래 두고 입을 것만 골라 담은 편집숍',
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
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>
        <AnalyticsProvider />
      </body>
    </html>
  );
}
