import type { Won } from '@shop/core';
import {
  createTranslator,
  moneyParts,
  formatMoney,
  DEFAULT_LOCALE,
  type Locale,
} from '@shop/i18n';
import { cn } from '../lib/cn';
import { VisuallyHidden } from './visually-hidden';

export interface PriceProps {
  readonly amount: Won;
  /** 정가. 할인이 있을 때만 넘긴다 */
  readonly listPrice?: Won | undefined;
  readonly discountPercent?: number | undefined;
  readonly size?: 'sm' | 'md' | 'lg';
  /**
   * 어느 말로 읽을지.
   *
   * 이 패키지는 요청을 모르므로 **쓰는 쪽이 알려 준다** — linkComponent 를
   * 주입받는 것과 같은 이유다. 기본값을 둬서 Storybook 처럼 요청이 없는
   * 곳에서도 그대로 그려진다.
   */
  readonly locale?: Locale;
  readonly className?: string;
}

const SIZE = {
  sm: { current: 'text-[13px]', strike: 'text-[11px]', unit: 'text-[11px]' },
  md: { current: 'text-[15px]', strike: 'text-xs', unit: 'text-xs' },
  lg: { current: 'text-2xl', strike: 'text-sm', unit: 'text-[17px]' },
} as const;

/**
 * 금액은 tabular-nums로 자릿수를 고정한다. 목록에서 세로로 흔들리면 비교가 어렵다.
 * "원"은 화면에 보이지 않을 때도 스크린리더가 읽도록 VisuallyHidden으로 덧댄다.
 */
export function Price({
  amount,
  listPrice,
  discountPercent,
  size = 'md',
  className,
  locale = DEFAULT_LOCALE,
}: PriceProps) {
  const s = SIZE[size];
  const t = createTranslator(locale);
  const money = moneyParts(locale, amount);
  const hasDiscount = listPrice !== undefined && discountPercent !== undefined && discountPercent > 0;

  return (
    /*
     * data-price 는 **파는 가격 그 값**이다. 화면 글자는 말과 자리에 따라
     * `289,000원` · `₩289,000` 으로 달라지고 취소선 정가·할인율이 같은
     * 상자 안에 섞여 있어, 글자에서 숫자를 되캐내는 것은 규칙을 두 벌
     * 만드는 일이다. 가격으로 좁히는 명세가 이 값을 본다.
     */
    <p data-price={amount} className={cn('flex flex-col gap-0.5', className)}>
      {hasDiscount && (
        <span className={cn('tnum text-n-500', s.strike)}>
          <VisuallyHidden>{t('price.listPrice')} </VisuallyHidden>
          <s>{formatMoney(locale, listPrice)}</s>
        </span>
      )}
      <span className="flex items-baseline gap-1.5">
        {hasDiscount && (
          <span className={cn('tnum font-semibold text-accent', s.current)}>
            {discountPercent}%<VisuallyHidden> {t('price.discount')}</VisuallyHidden>
          </span>
        )}
        <span className={cn('tnum font-semibold text-[var(--fg)]', s.current)}>
          {money.prefix && <span className={cn('font-medium', s.unit)}>{money.prefix}</span>}
          {money.number}
          {money.suffix && <span className={cn('font-medium', s.unit)}>{money.suffix}</span>}
        </span>
      </span>
    </p>
  );
}
