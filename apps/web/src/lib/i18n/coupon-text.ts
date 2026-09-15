import { formatMoney, formatPercent, type Locale, type Translator } from '@shop/i18n';

/**
 * 쿠폰 할인의 말 — "10,000원 할인", "20% 할인 (최대 30,000원)". 쿠폰함과 쿠폰 받기가 같은 말을 쓴다(따로 적으면 같은 쿠폰이
 * 두 화면에서 다르게 읽힌다). 서버·클라이언트 부품이 함께 쓴다.
 */
export function couponDiscountText(
  t: Translator,
  locale: Locale,
  c: { readonly kind: string; readonly value: number; readonly percent: number; readonly maxDiscount: number | null },
): string {
  if (c.kind === 'AMOUNT') return t('coupon.amountOff', { amount: formatMoney(locale, c.value) });
  return c.maxDiscount
    ? t('coupon.percentOffCapped', { percent: formatPercent(locale, c.percent), max: formatMoney(locale, c.maxDiscount) })
    : t('coupon.percentOff', { percent: formatPercent(locale, c.percent) });
}
