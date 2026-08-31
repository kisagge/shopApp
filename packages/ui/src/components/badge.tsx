import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const badge = cva(
  'inline-flex items-center rounded-xs px-2 text-[11px] font-semibold',
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
