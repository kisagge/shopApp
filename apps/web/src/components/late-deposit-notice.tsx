import Link from 'next/link';
import { lateDepositStage } from '@shop/core';
import { formatDate, formatNumber, type Locale, type Translator } from '@shop/i18n';

/**
 * 취소한 주문에 들어온 입금 — 손님의 주문 화면에서.
 *
 * **돈을 보낸 사람이 아무 말도 듣지 못했다.** 받은 돈은 운영 화면에만 떴고, 이 화면은 "취소" 만 말했다. 가상계좌 입금은
 * 받을 계좌를 알아야 돌려줄 수 있어서(PG 규칙) 손님이 할 일이 있는데, 그 일이 어디에도 적혀 있지 않았다.
 *
 * 돌려주기 전에는 할 일(1:1 문의로 계좌 알려 주기)을, 돌려준 뒤에는 언제 얼마를 돌려줬는지를 적는다.
 */
export function LateDepositNotice({
  payment, locale, t,
}: {
  payment: {
    readonly lateDepositAt: Date | null;
    readonly lateDepositAmount: number | null;
    readonly lateDepositResolvedAt: Date | null;
  } | null;
  locale: Locale;
  t: Translator;
}) {
  const stage = lateDepositStage(payment);
  if (stage === 'NONE' || !payment) return null;
  const amount = formatNumber(locale, payment.lateDepositAmount ?? 0);

  if (stage === 'REFUNDED' && payment.lateDepositResolvedAt) {
    return (
      <section
        aria-labelledby="late-deposit-title"
        className="max-w-[420px] rounded-sm bg-success-soft px-4 py-3"
      >
        <h2 id="late-deposit-title" className="text-[13px] font-semibold text-success">
          {t('lateDeposit.refundedHeading')}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-[var(--fg-secondary)]">
          {t('lateDeposit.refundedNotice', { amount, date: formatDate(locale, payment.lateDepositResolvedAt) })}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="late-deposit-title"
      className="max-w-[420px] rounded-sm border border-accent bg-accent-soft px-4 py-3"
    >
      <h2 id="late-deposit-title" className="text-[13px] font-semibold text-accent-hover">
        {t('lateDeposit.heading')}
      </h2>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--fg-secondary)]">
        {t('lateDeposit.notice', { amount })}
      </p>
      <Link
        href="/support/ask"
        className="mt-3 inline-flex h-11 items-center rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] no-underline"
      >
        {t('lateDeposit.ask')}
      </Link>
    </section>
  );
}
