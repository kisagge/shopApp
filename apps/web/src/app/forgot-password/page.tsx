import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '~/components/forgot-password-form';

export const metadata: Metadata = { title: '비밀번호 찾기' };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">비밀번호 찾기</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          가입할 때 쓴 이메일로 재설정 링크를 보내 드립니다.
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-[13px] text-[var(--fg-muted)]">
        <Link href="/login" className="text-[var(--fg)] underline underline-offset-2">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
