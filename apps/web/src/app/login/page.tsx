import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from '~/components/login-form';

export const metadata: Metadata = { title: '로그인' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-16">
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
