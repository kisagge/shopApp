'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { authClient } from '@shop/auth/client';
import { track } from '~/lib/analytics/client';
import { useIssueText, useT } from '~/lib/i18n/client';
import { useLazySchema } from '~/lib/form-schema';
import type { IssueBounds } from '~/lib/i18n/issue';

type FieldName = 'email' | 'name' | 'password' | 'passwordConfirm';

export function SignUpForm() {
  const router = useRouter();
  const t = useT();
  const getSchema = useLazySchema(async () => (await import('@shop/contract')).signUpSchema);
  const issueText = useIssueText();
  const [values, setValues] = useState({ email: '', name: '', password: '', passwordConfirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: FieldName, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // 고치기 시작하면 그 칸의 오류는 지운다. 다 지우면 다른 칸 오류까지 사라진다.
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = (await getSchema()).safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName | undefined;
        // 같은 칸에 여러 개가 걸리면 첫 번째만 보여 준다. 한 번에 하나씩 고치게 한다.
        if (key && !next[key]) next[key] = issueText(issue.message, issue as IssueBounds);
      }
      setFieldErrors(next);
      return;
    }

    setPending(true);
    const { error: authError } = await authClient.signUp.email({
      email: parsed.data.email,
      password: parsed.data.password,
      name: parsed.data.name,
    });
    setPending(false);

    if (authError) {
      if (authError.status === 429) {
        setError(t('auth.tooMany'));
        return;
      }
      /**
       * 이미 가입된 주소라는 사실은 알려 준다.
       *
       * 로그인 실패에서 어느 쪽이 틀렸는지 숨기는 것과 다르다. 가입 화면에서
       * 이걸 숨기면 사용자는 **왜 안 되는지 영원히 알 수 없다.** 게다가 이미
       * 가입된 주소인지는 비밀번호 재설정 화면에서도 어차피 드러난다.
       */
      if (authError.status === 422 || authError.code === 'USER_ALREADY_EXISTS') {
        setFieldErrors({ email: t('auth.emailTaken') });
        return;
      }
      setError(t('auth.signupFailed'));
      return;
    }

    track('sign_up', { method: 'email' });
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-5" noValidate>
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        required
        value={values.email}
        error={fieldErrors.email}
        onChange={(e) => set('email', e.target.value)}
      />
      <Field
        label={t('auth.name')}
        autoComplete="name"
        required
        value={values.name}
        error={fieldErrors.name}
        onChange={(e) => set('name', e.target.value)}
      />
      <Field
        label={t('auth.password')}
        type="password"
        /**
         * new-password 라야 비밀번호 관리자가 새 비밀번호를 제안한다.
         * current-password 를 쓰면 기존 것을 채워 넣으려 든다.
         */
        autoComplete="new-password"
        required
        value={values.password}
        error={fieldErrors.password}
        hint={t('auth.passwordHint')}
        onChange={(e) => set('password', e.target.value)}
      />
      <Field
        label={t('auth.passwordConfirm')}
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
        {pending ? t('auth.signingUp') : t('auth.signupSubmit')}
      </Button>

      <p className="text-center text-[13px] text-[var(--fg-muted)]">
        {t('auth.haveAccount')}{' '}
        <Link href="/login" className="text-[var(--fg)] underline underline-offset-2">
          {t('auth.login')}
        </Link>
      </p>
    </form>
  );
}
