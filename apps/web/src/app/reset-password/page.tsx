import type { Metadata } from 'next';
import Link from 'next/link';
import { ResetPasswordForm } from '~/components/reset-password-form';
import { NO_INDEX } from '~/lib/no-index';

export const metadata: Metadata = {
  title: '비밀번호 재설정',
  ...NO_INDEX,
};

/**
 * 메일의 링크가 도착하는 곳.
 *
 * 링크는 곧장 여기로 오지 않는다 — 먼저 인증 서버가 토큰을 확인하고, 살아
 * 있으면 `?token=`, 죽었으면 `?error=` 를 붙여 이리로 보낸다. 그래서 이
 * 화면은 토큰이 유효한지 스스로 판단하지 않는다.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">비밀번호 재설정</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">새 비밀번호를 정해 주세요.</p>
      </div>

      {token && !error ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
            {/* 만료·위조·직접 접근이 모두 여기로 온다. 셋을 구분해 줄 이유가 없다. */}
            링크가 올바르지 않거나 만료되었습니다.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex h-12 items-center justify-center rounded-sm bg-[var(--brand)] text-sm font-medium text-[var(--bg)] no-underline"
          >
            링크 다시 받기
          </Link>
        </div>
      )}
    </div>
  );
}
