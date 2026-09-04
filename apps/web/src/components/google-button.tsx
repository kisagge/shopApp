'use client';

import { useState } from 'react';
import { authClient } from '@shop/auth/client';

/**
 * 구글로 계속하기.
 *
 * 로그인과 가입이 같은 버튼이다 — 구글 계정으로 처음 오면 계정이 만들어지고,
 * 있으면 그대로 들어온다. 사용자에게 둘을 고르게 할 이유가 없다.
 */
export function GoogleButton({ next }: { next?: string | undefined }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function start() {
    setError(false);
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: next ?? '/',
        // 실패하면 우리 로그인 화면으로 돌아온다. 인증 서버의 기본 오류
        // 화면은 우리 것이 아니고 다음 행동도 알려 주지 못한다.
        errorCallbackURL: '/login',
      });
    } catch {
      /**
       * 여기까지 오는 것은 구글로 넘어가지도 못한 경우다 — 대개 연결이
       * 끊겼을 때다.
       *
       * 되돌리지 않으면 버튼이 "이동 중…" 에 갇혀 다시 누를 수도 없다.
       * 성공하면 브라우저가 구글로 떠나므로 이 자리로 돌아오지 않는다.
       */
      setPending(false);
      setError(true);
    }
  }

  return (
    <>
    {error && (
      <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
        구글로 이동하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.
      </p>
    )}
    <button
      type="button"
      aria-disabled={pending}
      onClick={start}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-sm border border-n-300 bg-[var(--bg)] text-sm font-medium text-[var(--fg)]"
    >
      {/* 구글 로고는 장식이다 — 이름은 버튼 글자가 준다 */}
      <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
      </svg>
      {pending ? '이동 중…' : '구글로 계속하기'}
    </button>
    </>
  );
}

/** 소셜 버튼과 이메일 폼 사이의 구분선. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[11px] text-[var(--fg-muted)]">또는</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
