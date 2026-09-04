import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSessionUser } from '@shop/auth/session';
import { SIGNUP_POINTS } from '@shop/core';
import { googleEnabled, googleNativeClientIds } from '@shop/auth';
import { SignUpForm } from '~/components/signup-form';
import { GoogleButton, OrDivider } from '~/components/google-button';
import { NO_INDEX } from '~/lib/no-index';

export const metadata: Metadata = {
  title: '회원가입',
  ...NO_INDEX,
};

export default async function SignUpPage() {
  // 이미 로그인한 사람에게 가입 화면을 보여 줄 이유가 없다
  const user = await getSessionUser(await headers());
  if (user) redirect('/');

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">회원가입</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          가입하면 <b className="tnum text-[var(--fg-secondary)]">{SIGNUP_POINTS.toLocaleString('ko-KR')}P</b> 를 드립니다.
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
