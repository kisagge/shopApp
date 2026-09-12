'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useT } from '~/lib/i18n/client';

/**
 * 결제 도중에 화면이 깨졌을 때.
 *
 * **여기서는 "다시 시도" 가 틀린 안내다.**
 *
 * 주문 만들기와 결제 승인은 서로 다른 요청이고, 그 사이 어디에서 깨졌는지
 * 화면은 알 수 없다. 주문이 이미 만들어졌는데 다시 시도하면 **같은 물건을
 * 두 번 사게 된다** — 멱등 열쇠가 같은 요청은 막지만, 화면이 다시 그려지면
 * 열쇠도 새로 만들어지므로 그 방어가 닿지 않는다.
 *
 * 루트 경계(app/error.tsx)는 "다시 시도" 버튼 하나를 준다. 다른 화면에서는
 * 그것이 맞다 — 목록을 다시 부르는 데 드는 값이 없다. 돈이 걸린 자리만
 * 다르게 말한다.
 *
 * 그래서 여기서는 **먼저 확인하라고** 말하고, 확인할 곳으로 데려간다.
 */
export default function CheckoutError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const t = useT();

  useEffect(() => {
    // 서버 오류는 instrumentation 이 받는다. 이건 브라우저에서 난 것이다.
    console.error('[checkout-error]', error.digest ?? '(digest 없음)', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-5 px-4 py-24 text-center">
      <h1 className="font-serif text-2xl font-medium tracking-tight">
        {t('error.checkoutHeading')}
      </h1>
      <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        {t('error.checkoutNote')}
      </p>

      {error.digest && (
        <p className="tnum rounded-sm bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--fg-muted)]">
          {t('error.digest', { digest: error.digest })}
        </p>
      )}

      {/*
        확인이 먼저다. 그래서 주문 내역을 주된 걸음으로 두고 장바구니는
        곁에 둔다 — 순서를 뒤집으면 "다시 담아서 또 사라" 는 말이 된다.
      */}
      <div className="flex w-full flex-col gap-2">
        {/* 링크를 버튼처럼 쓴다 — 빈 장바구니 화면과 같은 방식이다 */}
        <Link
          href="/mypage/orders"
          className="inline-flex h-12 items-center justify-center rounded-sm bg-[var(--brand)] px-7 text-sm font-medium text-[var(--bg)] no-underline"
        >
          {t('error.checkoutOrders')}
        </Link>
        <Link
          href="/cart"
          className="py-2 text-[13px] text-[var(--fg-secondary)] underline underline-offset-4"
        >
          {t('error.checkoutCart')}
        </Link>
      </div>
    </div>
  );
}
