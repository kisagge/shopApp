import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const badge = cva(
  /*
   * **줄바꿈되지 않는다.** 뱃지는 높이가 정해진 알약이라 글자가 두 줄이 되면
   * 상자 밖으로 삐져나온다 — 운영 화면의 표가 좁아지자 '판매중' 이 37px 이
   * 되어 24px 상자를 넘쳤고, 주문 표에서는 '환불완료' 가 45px 이었다.
   * 줄이는 것은 표가 할 일이고, 뱃지는 자기 낱말을 지킨다.
   */
  'inline-flex shrink-0 items-center whitespace-nowrap rounded-xs px-2 text-[11px] font-semibold',
  {
    variants: {
      tone: {
        sale: 'h-6 bg-accent text-n-0',
        new: 'h-6 bg-n-900 text-n-0',
        info: 'h-6 bg-info-soft text-info',
        success: 'h-6 bg-success-soft text-success',
        neutral: 'h-6 bg-n-100 text-n-600',
        danger: 'h-6 bg-accent-soft text-accent-hover',
        outline: 'h-6 border border-n-300 font-medium text-n-600',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

/**
 * 상태를 색으로만 전달하지 않는다 — 뱃지는 항상 텍스트를 함께 담는다.
 * 색맹 사용자와 흑백 인쇄에서 의미가 사라지기 때문이다.
 */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
