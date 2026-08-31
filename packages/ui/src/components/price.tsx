import { format, type Won } from '@shop/core';
import { cn } from '../lib/cn';
import { VisuallyHidden } from './visually-hidden';

export interface PriceProps {
  readonly amount: Won;
  /** 정가. 할인이 있을 때만 넘긴다 */
  readonly listPrice?: Won | undefined;
  readonly discountPercent?: number | undefined;
  readonly size?: 'sm' | 'md' | 'lg';
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
export function Price({ amount, listPrice, discountPercent, size = 'md', className }: PriceProps) {
  const s = SIZE[size];
  const hasDiscount = listPrice !== undefined && discountPercent !== undefined && discountPercent > 0;

  return (
    <p className={cn('flex flex-col gap-0.5', className)}>
      {hasDiscount && (
        <span className={cn('tnum text-n-500', s.strike)}>
          <VisuallyHidden>정가 </VisuallyHidden>
          <s>{format(listPrice)}원</s>
        </span>
      )}
      <span className="flex items-baseline gap-1.5">
        {hasDiscount && (
          <span className={cn('tnum font-semibold text-accent', s.current)}>
            {discountPercent}%<VisuallyHidden> 할인</VisuallyHidden>
          </span>
        )}
        <span className={cn('tnum font-semibold text-[var(--fg)]', s.current)}>
          {format(amount)}
          <span className={cn('font-medium', s.unit)}>원</span>
        </span>
      </span>
    </p>
  );
}
