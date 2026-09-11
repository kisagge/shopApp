import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '../lib/cn';

const button = cva(
  // 라벨이 줄바꿈되면 버튼 높이가 무너지거나 글자가 잘린다. 이 디자인의
  // 버튼 라벨은 모두 짧으므로 기본으로 막는다.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors ' +
    'disabled:cursor-not-allowed aria-disabled:cursor-not-allowed',
  {
    variants: {
      /*
       * **`disabled:` 와 `aria-disabled:` 를 같이 쓴다.**
       *
       * 이 컴포넌트는 아래 주석대로 `disabled` 보다 `aria-disabled` 를
       * 권한다. 그런데 색을 바꾸는 규칙은 primary 에만 양쪽이 붙어 있었고
       * 나머지 넷은 `disabled:` 뿐이었다. 그래서 **권하는 대로 쓰면 버튼이
       * 멀쩡해 보이고, 눌러도 아무 일이 안 일어났다.**
       *
       * 상품 상세의 `장바구니 담기`(secondary)가 그랬다 — 옵션을 고르기
       * 전에도 평소와 똑같이 보이고, 마우스를 올리면 밝아지기까지 했다.
       * 옆의 `구매하기`(primary)는 흐려지는데 둘이 나란히 서 있었다.
       * 어드민의 `주문취소`(danger)와 주문 취소 확인(accent)도 같았다.
       *
       * `aria-disabled:hover:` 까지 거는 이유는, 못 누르는 버튼이 마우스를
       * 올릴 때 밝아지면 다시 "눌린다" 고 말하기 때문이다.
       *
       * **손으로 맞춰 둔 짝이라 검사로 지킨다**(button-disabled.test.tsx).
       * 클래스 이름을 코드로 조립하면 Tailwind 가 그 문자열을 못 보고
       * CSS 를 아예 안 만든다 — 조용히 사라지는 종류의 실패다.
       */
      variant: {
        primary:
          'bg-[var(--brand)] text-[var(--bg)] hover:bg-[var(--brand-hover)] ' +
          'disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:bg-[var(--bg-disabled)] aria-disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:hover:bg-[var(--bg-disabled)]',
        secondary:
          'border border-n-300 bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--surface)] hover:border-n-500 ' +
          'disabled:border-[var(--border)] disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:border-[var(--border)] aria-disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:hover:bg-[var(--bg)] aria-disabled:hover:border-[var(--border)]',
        accent:
          'bg-accent text-n-0 hover:bg-accent-hover ' +
          'disabled:bg-[var(--bg-disabled)] disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:bg-[var(--bg-disabled)] aria-disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:hover:bg-[var(--bg-disabled)]',
        ghost:
          'text-[var(--fg-secondary)] hover:bg-[var(--surface-2)] ' +
          'disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:text-[var(--fg-disabled)] aria-disabled:hover:bg-transparent',
        danger:
          'border border-n-200 text-accent hover:bg-accent-soft ' +
          'disabled:text-[var(--fg-disabled)] ' +
          'aria-disabled:text-[var(--fg-disabled)] aria-disabled:hover:bg-transparent',
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
