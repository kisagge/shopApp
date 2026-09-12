import type { Metadata } from 'next';
import { getViewer } from '~/lib/viewer';
import { redirect } from 'next/navigation';
import { SIGNUP_POINTS } from '@shop/core';
import { googleEnabled, googleNativeClientIds } from '@shop/auth';
import { SignUpForm } from '~/components/signup-form';
import { GoogleButton, OrDivider } from '~/components/google-button';
import { NO_INDEX } from '~/lib/no-index';
import { formatNumber } from '@shop/i18n';
import { getLocale, getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('auth.signup'), ...NO_INDEX };
}

export default async function SignUpPage() {
  // 이미 로그인한 사람에게 가입 화면을 보여 줄 이유가 없다
  const user = await getViewer();
  if (user) redirect('/');

  const [locale, t] = await Promise.all([getLocale(), getT()]);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t('auth.signup')}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {t('auth.signupBonus', { points: `${formatNumber(locale, SIGNUP_POINTS)}P` })}
        </p>
      </div>
      {googleEnabled() && (
        <>
          <GoogleButton nativeIds={googleNativeClientIds() ?? undefined} />
          <OrDivider />
        </>
      )}

      <SignUpForm />
    </div>
  );
}
