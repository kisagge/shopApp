import type { Metadata } from 'next';
import { LoginForm } from '~/components/login-form';

export const metadata: Metadata = { title: '로그인' };

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">로그인</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          개발용 계정 — <code className="tnum">demo@plain.test</code> /{' '}
          <code className="tnum">plain1234!</code>
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
