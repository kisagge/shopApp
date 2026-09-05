'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { resetPasswordSchema } from '@shop/contract';
import { authClient } from '@shop/auth/client';
import { useIssueText, useT } from '~/lib/i18n/client';
import type { IssueBounds } from '~/lib/i18n/issue';

type FieldName = 'password' | 'passwordConfirm';

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const issueText = useIssueText();
  const router = useRouter();
  const [values, setValues] = useState({ password: '', passwordConfirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (key: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = resetPasswordSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName | undefined;
        if (key && !next[key]) next[key] = issueText(issue.message, issue as IssueBounds);
      }
      setFieldErrors(next);
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    });
    setPending(false);

    if (authError) {
      /**
       * 만료·사용된 토큰은 다시 받게 한다.
       *
       * "실패했습니다" 만 보여 주면 사용자는 같은 링크를 계속 누른다.
       * 링크가 죽었다는 사실과 다음 행동을 함께 줘야 한다.
       */
      if (authError.status === 400 || authError.status === 401) {
        setExpired(true);
        return;
      }
      setError(t('auth.resetFailed'));
      return;
    }

    // 비밀번호가 바뀌면 기존 세션은 끊긴다. 새 비밀번호로 다시 들어오게 한다.
    router.push('/login?reset=1');
    router.refresh();
  }

  if (expired) {
    return (
      <div role="alert" className="flex flex-col gap-4">
        <p className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {t('auth.linkExpired')}
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-12 items-center justify-center rounded-sm bg-[var(--brand)] text-sm font-medium text-[var(--bg)] no-underline"
        >
          {t('auth.resendLink')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-5" noValidate>
      <Field
        label={t('auth.newPassword')}
        type="password"
        autoComplete="new-password"
        required
        value={values.password}
        error={fieldErrors.password}
        hint={t('auth.passwordHint')}
        onChange={(e) => set('password', e.target.value)}
      />
      <Field
        label={t('auth.newPasswordConfirm')}
        type="password"
        autoComplete="new-password"
        required
        value={values.passwordConfirm}
        error={fieldErrors.passwordConfirm}
        onChange={(e) => set('passwordConfirm', e.target.value)}
      />

      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <Button type="submit" block aria-disabled={pending}>
        {pending ? t('auth.resetting') : t('auth.resetSubmit')}
      </Button>
    </form>
  );
}
