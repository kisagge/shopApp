import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm font-medium transition-colors ' +
    'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--brand)] text-[var(--bg)] hover:bg-[var(--brand-hover)] ' +
          'disabled:bg-n-200 disabled:text-n-400 aria-disabled:bg-n-200 aria-disabled:text-n-400',
        secondary:
          'border border-n-300 bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--surface)] hover:border-n-500 ' +
          'disabled:border-n-200 disabled:text-n-400',
        accent:
          'bg-accent text-n-0 hover:bg-accent-hover disabled:bg-n-200 disabled:text-n-400',
        ghost:
          'text-[var(--fg-secondary)] hover:bg-[var(--surface-2)] disabled:text-n-400',
        danger:
          'border border-n-200 text-accent hover:bg-accent-soft disabled:text-n-400',
      },
      size: {
        // 모바일 터치 타겟 최소 44px. sm/md는 데스크톱 전용으로만 쓸 것.
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-5 text-sm',
        xl: 'h-13 px-6 text-[15px]',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'lg', block: false },
  },
);

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof button> {
  ref?: Ref<HTMLButtonElement>;
}

/**
 * 동작에는 button, 이동에는 a를 쓴다. 이 컴포넌트는 동작 전용이다.
 * 비활성 상태는 disabled 대신 aria-disabled를 권장한다 — disabled된 버튼은
 * 포커스를 못 받아서 왜 못 누르는지 스크린리더 사용자가 알 수 없다.
 */
export function Button({ className, variant, size, block, type, ...props }: ButtonProps) {
  return (
    <button
      // type을 빼먹으면 폼 안에서 submit이 되어버린다
      type={type ?? 'button'}
      className={cn(button({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { button as buttonVariants };
