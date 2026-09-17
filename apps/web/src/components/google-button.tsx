'use client';

import { useState } from 'react';
import { authClient } from '@shop/auth/client';
import { safeNextPath } from '@shop/core';
import { isNativeShell, nativeGoogleIdToken, type GoogleClientIds } from '@shop/native';
import { useT } from '~/lib/i18n/client';

/**
 * 구글로 계속하기.
 *
 * 로그인과 가입이 같은 버튼이다 — 구글 계정으로 처음 오면 계정이 만들어지고,
 * 있으면 그대로 들어온다. 사용자에게 둘을 고르게 할 이유가 없다.
 */
export function GoogleButton({
  next,
  nativeIds,
}: {
  next?: string | undefined;
  /** 네이티브 셸에서만 쓴다. 공개 값이라 화면으로 내려도 된다. */
  nativeIds?: GoogleClientIds | undefined;
}) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  // 주소에 실린 값이 여기까지 온다 — 남의 사이트로 보내지 않게 한 번 더 거른다(safeNextPath)
  const destination = safeNextPath(next);

  async function start() {
    setError(false);
    setPending(true);
    try {
      /**
       * 앱에서는 브라우저로 넘기지 않는다.
       *
       * 구글이 임베디드 웹뷰의 OAuth 를 막기 때문에 여기서 이동하면
       * "안전하지 않은 브라우저" 화면에서 끝난다. 대신 OS 가 띄우는 네이티브
       * 계정 선택에서 ID 토큰만 받아 **이 웹뷰에서** 서버로 보낸다 —
       * 요청이 웹뷰에서 나가야 세션 토큰도 웹뷰로 돌아온다.
       */
      if (nativeIds && isNativeShell()) {
        const idToken = await nativeGoogleIdToken(nativeIds);
        if (!idToken) throw new Error('NO_ID_TOKEN');

        const { error: authError } = await authClient.signIn.social({
          provider: 'google',
          idToken: { token: idToken },
        });
        if (authError) throw new Error('SIGN_IN_FAILED');

        // typedRoutes 는 임의 문자열을 경로로 받지 않는다. 통째로 새로
        // 여는 편이 안전하기도 하다 — 세션이 바뀌었으니 서버 렌더도 새로 받는다.
        window.location.assign(destination);
        return;
      }

      await authClient.signIn.social({
        provider: 'google',
        callbackURL: destination,
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
        {t('auth.googleFailed')}
      </p>
    )}
    <button
      type="button"
      aria-disabled={pending}
      onClick={start}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] text-sm font-medium text-[var(--fg)]"
    >
      {/* 구글 로고는 장식이다 — 이름은 버튼 글자가 준다 */}
      <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
      </svg>
      {pending ? t('auth.googleMoving') : t('auth.google')}
    </button>
    </>
  );
}

/** 소셜 버튼과 이메일 폼 사이의 구분선. */
export function OrDivider() {
  const t = useT();
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-[var(--border)]" />
      <span className="text-[11px] text-[var(--fg-muted)]">{t('auth.or')}</span>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}
