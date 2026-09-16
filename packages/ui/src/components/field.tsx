'use client';

import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '../lib/cn';

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly label: string;
  /** 에러 문구. 있으면 aria-invalid와 aria-describedby가 자동으로 연결된다 */
  readonly error?: string | undefined;
  /** 에러가 아닌 보조 설명 */
  readonly hint?: ReactNode;
  readonly ref?: Ref<HTMLInputElement>;
}

/**
 * label과 input을 id로 묶고, 에러를 aria-describedby로 연결한다.
 * 에러를 빨간 글씨로만 표시하면 스크린리더 사용자에게는 존재하지 않는 것과 같다.
 */
export function Field({ label, error, hint, className, required, ...props }: FieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  /*
   * **그리는 조건과 같아야 한다.** 힌트는 오류가 있을 때 자리를 내주는데(아래 `hint && !error`),
   * 여기서는 힌트가 있기만 하면 가리키고 있었다 — 오류와 힌트가 함께 있는 칸은 없는 id 를
   * 가리키는 셈이라 낭독기가 설명을 통째로 버리기도 한다.
   */
  const showHint = hint !== undefined && !error;
  const describedBy = [error ? errorId : null, showHint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-[var(--fg-secondary)]">
        {label}
        {required && (
          <span className="ml-1 text-accent" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (필수)</span>}
      </label>

      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={cn(
          'h-12 rounded-sm border bg-[var(--bg)] px-3.5 text-sm text-[var(--fg)]',
          'placeholder:text-[var(--fg-muted)]',
          error ? 'border-accent' : 'border-[var(--border-strong)]',
          className,
        )}
        {...props}
      />

      {showHint && (
        <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
          {hint}
        </p>
      )}
      {error && (
        // role="alert"이라야 입력 도중 나타난 에러가 즉시 읽힌다
        <p id={errorId} role="alert" className="text-[11px] text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
