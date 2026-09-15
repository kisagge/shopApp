'use client';

import { useState } from 'react';
import { TrackedLink as Link } from '~/components/tracked-link';
import { formatDate, formatMoney } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';
import { couponDiscountText } from '~/lib/i18n/coupon-text';

export interface DownloadableCouponView {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly value: number;
  readonly percent: number;
  readonly maxDiscount: number | null;
  readonly minimumOrder: number;
  /** ISO 문자열. 서버 컴포넌트에서 Date 를 넘기지 않는다 */
  readonly endsAt: string;
  readonly limited: boolean;
  readonly remaining: number | null;
  readonly claimed: boolean;
}

/**
 * 받기 단추가 달린 쿠폰 목록 — 쿠폰 받기 화면과 상품 화면이 함께 쓴다.
 *
 * **받으면 단추 자리에 "받음" 이 남는다.** 단추를 지우면 누른 곳의 초점이 문서 처음으로 튀고, 받은 것인지 사라진 것인지
 * 헷갈린다. 같은 자리에서 누를 수 없는 상태(aria-disabled)로 바꾸고, 결과는 알림 영역에 말한다.
 *
 * 로그인하지 않았으면 단추 대신 로그인하러 가는 링크 — 돌아올 곳을 달아 준다.
 */
export function CouponDownloads({
  coupons,
  loggedIn,
  returnTo,
  headingId,
}: {
  coupons: readonly DownloadableCouponView[];
  loggedIn: boolean;
  /** 로그인한 뒤 돌아올 주소 */
  returnTo: string;
  /** 목록의 이름이 될 제목 id */
  headingId: string;
}) {
  const t = useT();
  const locale = useLocale();
  const [claimed, setClaimed] = useState<ReadonlySet<string>>(() => new Set(coupons.filter((c) => c.claimed).map((c) => c.id)));
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function download(coupon: DownloadableCouponView) {
    if (claimed.has(coupon.id) || pending) return;
    setPending(coupon.id);
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/coupons/${coupon.id}/download`, { method: 'POST' });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { code?: unknown; message?: unknown } | null;
        // 이미 받은 쿠폰이면 받은 것으로 맞춰 둔다 — 다른 창에서 받았을 수 있다
        if (body?.code === 'ALREADY_ISSUED') setClaimed((s) => new Set(s).add(coupon.id));
        setError(typeof body?.message === 'string' && body.message ? body.message : t('coupon.claimFailed'));
        return;
      }
      setClaimed((s) => new Set(s).add(coupon.id));
      setStatus(t('coupon.downloadDone', { name: coupon.name }));
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="sr-only">{status}</p>
      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">{error}</p>
      )}
      <ul aria-labelledby={headingId} className="flex flex-col gap-2">
        {coupons.map((c) => {
          const got = claimed.has(c.id);
          return (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[var(--border)] p-3.5">
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-[14px] font-semibold">{couponDiscountText(t, locale, c)}</p>
                <p className="text-[13px] text-[var(--fg-secondary)]">{c.name}</p>
                <p className="text-[12px] text-[var(--fg-muted)]">
                  {[
                    c.minimumOrder > 0 ? t('coupon.minimum', { amount: formatMoney(locale, c.minimumOrder) }) : null,
                    c.limited ? t('coupon.someProducts') : null,
                    c.remaining !== null ? t('coupon.remaining', { count: c.remaining }) : null,
                    `${formatDate(locale, c.endsAt)} ${t('coupon.until')}`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              {!loggedIn ? (
                <Link
                  href={`/login?next=${encodeURIComponent(returnTo)}`}
                  className="inline-flex h-9 shrink-0 items-center rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)] no-underline"
                >
                  {t('coupon.downloadLogin')}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void download(c)}
                  aria-disabled={got || pending === c.id ? true : undefined}
                  aria-label={got ? t('coupon.downloadedNamed', { name: c.name }) : t('coupon.downloadNamed', { name: c.name })}
                  className={`h-9 shrink-0 rounded-sm px-3.5 text-[13px] font-medium ${
                    got
                      ? 'border border-[var(--border)] text-[var(--fg-muted)]'
                      : 'bg-[var(--brand)] text-[var(--bg)] aria-disabled:opacity-60'
                  }`}
                >
                  {got ? t('coupon.downloaded') : pending === c.id ? t('coupon.claiming') : t('coupon.download')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
