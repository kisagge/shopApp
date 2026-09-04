import type { Metadata } from 'next';
import Link from 'next/link';
import { googleEnabled, googleNativeClientIds } from '@shop/auth';
import { LoginForm } from '~/components/login-form';
import { GoogleButton, OrDivider } from '~/components/google-button';

export const metadata: Metadata = { title: '로그인' };

/**
 * 소셜 로그인이 실패했을 때 인증 서버가 붙여 보내는 코드.
 *
 * 모르는 코드까지 하나하나 옮기지 않는다. 다만 **연결 거부만은 반드시
 * 따로 말해 준다** — 그 사용자는 "구글로 로그인했는데 안 된다" 는 상태에
 * 갇히고, 무엇을 해야 하는지 짐작할 방법이 없다.
 */
const SOCIAL_ERROR: Record<string, string> = {
  account_not_linked:
    '이 이메일은 비밀번호로 가입되어 있습니다. 비밀번호로 로그인하시거나, 잊으셨다면 아래에서 재설정해 주세요.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string; error?: string }>;
}) {
  const { reset, next, error } = await searchParams;
  const socialError = error ? (SOCIAL_ERROR[error] ?? '구글 로그인에 실패했습니다. 다시 시도해 주세요.') : null;

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">로그인</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          개발용 계정 — <code className="tnum">demo@plain.test</code> /{' '}
          <code className="tnum">plain1234!</code>
        </p>
      </div>

      {reset === '1' && (
        // 비밀번호를 바꾸면 세션이 끊긴다. 왜 다시 로그인해야 하는지 말해 준다.
        <p role="status" className="rounded-sm bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--fg-secondary)]">
          비밀번호를 바꿨습니다. 새 비밀번호로 로그인해 주세요.
        </p>
      )}

      {socialError && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] leading-relaxed text-accent-hover">
          {socialError}
        </p>
      )}

      {googleEnabled() && (
        <>
          <GoogleButton next={next} nativeIds={googleNativeClientIds() ?? undefined} />
          <OrDivider />
        </>
      )}

      <LoginForm />

      <p className="text-center text-[13px]">
        <Link href="/forgot-password" className="text-[var(--fg-muted)] underline underline-offset-2">
          비밀번호를 잊으셨나요?
        </Link>
      </p>

      <p className="text-center text-[13px] text-[var(--fg-muted)]">
        아직 계정이 없으신가요?{' '}
        <Link href="/signup" className="text-[var(--fg)] underline underline-offset-2">
          회원가입
        </Link>
      </p>
    </div>
  );
}
