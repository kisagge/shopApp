'use client';

import { useState } from 'react';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 이메일 인증 상태와 다시 보내기.
 *
 * **인증 메일은 가입할 때 한 번 나가고 끝이었다.** 그 메일을 지웠거나 스팸함에 들어갔으면 다시 받을 길이 없었고,
 * 인증했는지조차 손님 화면 어디에도 보이지 않았다(운영 화면에만 "미인증" 이 떴다). 확인을 강제하지는 않지만
 * (auth 의 requireEmailVerification), 주문·환불 안내가 가는 주소라 맞는지 확인할 길은 있어야 한다.
 *
 * 요청 제한은 인증 서버가 한다(이 주소는 1분에 세 번). 걸렸을 때는 "방금 보냈다" 고 말한다 — 여러 번 누른 사람이다.
 * 결과를 말하는 자리(role="status")는 처음부터 두어 낭독기가 놓치지 않게 한다.
 */
export function EmailVerification({ email, verified }: { email: string; verified: boolean }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function resend() {
    setPending(true);
    setMessage(null);
    try {
      // 인증 SDK 는 누를 때 받는다 — 회원정보만 고치러 온 사람에게까지 싣지 않는다(auth-client-boundary)
      const { authClient } = await import('@shop/auth/client');
      const { error } = await authClient.sendVerificationEmail({
        email,
        // 인증을 마치면 이 화면으로 돌아와 마쳤다고 말한다
        callbackURL: '/mypage/account?verified=1',
      });
      if (!error) setMessage({ tone: 'ok', text: t('acct.resendSent') });
      else if (error.status === 429) setMessage({ tone: 'error', text: t('acct.resendLimited') });
      else setMessage({ tone: 'error', text: t('acct.resendFailed') });
    } catch {
      setMessage({ tone: 'error', text: t('acct.resendFailed') });
    } finally {
      setPending(false);
    }
  }

  if (verified) {
    return (
      <span className="mt-1 inline-flex w-fit items-center rounded-xs bg-success-soft px-1.5 py-0.5 text-[11px] font-medium text-success">
        {t('acct.emailVerified')}
      </span>
    );
  }

  return (
    <div className="mt-1 flex flex-col items-start gap-2">
      <span className="inline-flex items-center rounded-xs bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning">
        {t('acct.emailUnverified')}
      </span>
      <span className="text-[12px] text-[var(--fg-secondary)]">{t('acct.emailUnverifiedNote')}</span>
      {/* 손님 화면은 휴대폰에서도 연다 — 누를 자리는 44px 이상(기본 크기) */}
      <Button type="button" variant="secondary" onClick={() => void resend()} disabled={pending}>
        {pending ? t('acct.resendSending') : t('acct.resendVerify')}
      </Button>
      <p
        role="status"
        className={`text-[12px] ${message?.tone === 'error' ? 'text-accent' : 'text-success'}`}
      >
        {message?.text ?? ''}
      </p>
    </div>
  );
}
