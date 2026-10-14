'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field } from '@shop/ui';
import { formatDate, formatMoney } from '@shop/i18n';
import { TrackedLink as Link } from '~/components/tracked-link';
import { couponDiscountText } from '~/lib/i18n/coupon-text';
import { useLocale, useT } from '~/lib/i18n/client';

interface WalletCoupon {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number;
  percent: number;
  maxDiscount: number | null;
  minimumOrder: number;
  usedAt: Date | string | null;
  expiresAt: Date | string;
  /**
   * 기간이 지났는가. **서버가 정해서 내려 준다.**
   * 렌더 중에 Date.now() 를 부르면 서버와 클라이언트가 다른 값을 봐서
   * 만료 표시가 어긋난다 — 화면이 깜빡이며 바뀌는 종류의 버그다.
   */
  expired: boolean;
}

/**
 * 쿠폰함.
 *
 * 쓴 쿠폰과 만료된 쿠폰도 지우지 않고 흐리게 남긴다. 조용히 사라지면
 * "분명히 있었는데" 가 되고, 그건 그대로 문의가 된다.
 */
export function CouponWallet({ initial }: { initial: readonly WalletCoupon[] }) {
  const t = useT();
  const locale = useLocale();
  const money = (amount: number) => formatMoney(locale, amount);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setStatus('');

    /*
     * **폼을 지금 붙잡아 둔다.** `event.currentTarget` 은 처리기가 끝나는
     * 순간 null 이 된다 — 리액트가 전달을 마치며 비운다.
     *
     * 아래에서 `event.currentTarget.reset()` 을 await 뒤에 부르고 있었다.
     * 그래서 **받기가 성공한 바로 그 길에서** null 을 건드려 터졌고, 그
     * 예외를 아래 catch 가 받아 네트워크 오류라고 적었다. 받은 사람 화면에
     * "웰컴 10%을(를) 받았습니다" 와 "네트워크 오류로 처리하지 못했습니다"
     * 가 **나란히** 섰고, 그 줄에서 멈춰 `router.refresh()` 도 안 돌아
     * 쿠폰함은 비어 있었다. 다시 누르면 이번엔 "이미 받았습니다" 가 뜬다 —
     * 사람이 보기에 받은 적도 없는데.
     */
    const form = event.currentTarget;
    const value = new FormData(form).get('code');
    const code = typeof value === 'string' ? value.trim() : '';

    try {
      const response = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = (await response.json().catch(() => ({}))) as { name?: string; message?: string };
      if (!response.ok) {
        setError(result.message ?? t('coupon.claimFailed'));
        return;
      }
      setStatus(t('coupon.claimed', { name: result.name ?? t('coupon.fallbackName') }));
      form.reset();
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  const discountText = (c: WalletCoupon) => couponDiscountText(t, locale, c);

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => onClaim(e)}
        className="flex items-end gap-2 rounded-sm border border-[var(--border)] p-4"
      >
        <Field
          label={t('coupon.codeLabel')}
          name="code"
          required
          maxLength={30}
          placeholder="WELCOME10"
          className="w-[200px] uppercase"
        />
        <Button type="submit" disabled={pending}>
          {pending ? t('coupon.claiming') : t('coupon.claim')}
        </Button>
      </form>

      {/* 코드가 없어도 받을 수 있는 쿠폰이 있다 — 코드 칸만 두면 그 길을 모른다 */}
      <p className="-mt-3 text-[13px]">
        <Link href="/coupons" className="text-[var(--fg)] underline underline-offset-2">{t('coupon.goDownload')}</Link>
      </p>

      <p aria-live="polite" className="text-[13px] text-[var(--fg-secondary)]">
        {status}
      </p>
      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      {initial.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          {t('coupon.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {initial.map((c) => {
            const used = c.usedAt !== null;
            const expired = !used && c.expired;
            const dim = used || expired;
            return (
              <li
                key={c.id}
                className={`flex items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4 ${
                  dim ? 'opacity-55' : ''
                }`}
              >
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {c.name}
                    {/* 상태를 흐림으로만 알리지 않는다 */}
                    {used && <Badge tone="neutral">{t('coupon.used')}</Badge>}
                    {expired && <Badge tone="neutral">{t('coupon.expired')}</Badge>}
                  </p>
                  <p className="text-[13px] text-[var(--fg-secondary)]">{discountText(c)}</p>
                  <p className="text-[12px] text-[var(--fg-muted)]">
                    {c.minimumOrder > 0 && `${t('coupon.minimum', { amount: money(c.minimumOrder) })} · `}
                    {/*
                      금액은 고른 말로 적으면서 날짜만 'ko-KR' 로 못 박혀 있었다 — 영어로
                      보는 사람에게 한 줄 안에서 말이 갈린다. `formatDate` 는 파는 곳의
                      시계(Asia/Seoul)를 그대로 쓰므로 어긋남 없이 말만 바뀐다.
                    */}
                    <span className="tnum">{formatDate(locale, c.expiresAt)}</span>
                    {t('coupon.until')}
                  </p>
                </div>
                <span className="tnum shrink-0 text-[11px] text-[var(--fg-muted)]">{c.code}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
