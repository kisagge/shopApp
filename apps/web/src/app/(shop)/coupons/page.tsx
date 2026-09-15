import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getSessionUser } from '@shop/auth/session';
import { TrackedLink as Link } from '~/components/tracked-link';
import { CouponDownloads } from '~/components/coupon-downloads';
import { listDownloadableCoupons } from '~/lib/coupons/downloadable';
import { getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('coupon.downloadTitle') };
}
export const dynamic = 'force-dynamic';

/**
 * 쿠폰 받기.
 *
 * 전에는 쿠폰을 코드 입력과 운영 지급으로만 받았다 — 코드를 모르면 있는 쿠폰도 없는 것이었다. 운영이 "누구나 받기" 로 공개한
 * 쿠폰을 모아 한 번에 받게 한다. **로그인하지 않아도 본다** — 무엇을 받을 수 있는지 알아야 로그인할 이유가 생긴다.
 */
export default async function CouponDownloadPage() {
  const [viewer, t] = await Promise.all([headers().then((h) => getSessionUser(h)), getT()]);
  const coupons = await listDownloadableCoupons({ userId: viewer?.id ?? null });

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 id="coupon-download-title" className="pt-8 pb-2 text-xl font-semibold tracking-tight md:text-2xl">
        {t('coupon.downloadTitle')}
      </h1>
      <p className="pb-6 text-[13px] text-[var(--fg-secondary)]">
        {t('coupon.downloadLead')}{' '}
        {viewer && (
          <Link href="/mypage/coupons" className="text-[var(--fg)] underline underline-offset-2">{t('my.couponsHeading')}</Link>
        )}
      </p>
      {coupons.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">{t('coupon.downloadEmpty')}</p>
      ) : (
        <CouponDownloads
          coupons={coupons.map((c) => ({ ...c, endsAt: c.endsAt.toISOString() }))}
          loggedIn={viewer !== null}
          returnTo="/coupons"
          headingId="coupon-download-title"
        />
      )}
    </div>
  );
}
