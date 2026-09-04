import Link from 'next/link';
import type { Metadata } from 'next';
import type { MessageKey } from '@shop/i18n';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('checkout.failHeading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/**
 * 결제창이 실패로 돌아오는 자리.
 *
 * 토스가 code·message 를 붙여 보낸다. **그 문구를 그대로 화면에 넣지 않는다** —
 * 쿼리는 누구나 고칠 수 있어서, 링크 하나로 우리 도메인에 원하는 문장을
 * 띄울 수 있게 된다. 아는 코드만 우리 문구로 바꿔 보여 준다.
 */
const REASON_KEY: Readonly<Record<string, MessageKey>> = {
  PAY_PROCESS_CANCELED: 'payFail.PAY_PROCESS_CANCELED',
  PAY_PROCESS_ABORTED: 'payFail.PAY_PROCESS_ABORTED',
  REJECT_CARD_COMPANY: 'payFail.REJECT_CARD_COMPANY',
  INVALID_CARD_EXPIRATION: 'payFail.INVALID_CARD_EXPIRATION',
  EXCEED_MAX_DAILY_PAYMENT_COUNT: 'payFail.EXCEED_MAX_DAILY_PAYMENT_COUNT',
  NOT_ENOUGH_BALANCE: 'payFail.NOT_ENOUGH_BALANCE',
  INVALID_CALLBACK: 'payFail.INVALID_CALLBACK',
  ORDER_NOT_FOUND: 'payFail.ORDER_NOT_FOUND',
};

export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params['code'];
  const code = typeof raw === 'string' ? raw : '';
  const t = await getT();
  const message = t(REASON_KEY[code] ?? 'payFail.default');

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-5 py-24 text-center">
      <h1 className="text-[22px] font-semibold tracking-tight">{t('checkout.failHeading')}</h1>
      <p className="text-[15px] leading-relaxed text-[var(--fg-secondary)]">{message}</p>
      <p className="text-[13px] text-[var(--fg-muted)]">
        {t('checkout.failNote')}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/checkout"
          className="rounded-md bg-n-900 px-5 py-2.5 text-[14px] font-medium text-n-0 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          {t('checkout.retry')}
        </Link>
        <Link
          href="/cart"
          className="rounded-md border border-[var(--border)] px-5 py-2.5 text-[14px] font-medium text-[var(--fg)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          {t('checkout.toCart')}
        </Link>
      </div>
    </div>
  );
}
