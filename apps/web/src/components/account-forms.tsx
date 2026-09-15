'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { useIssueText, useT } from '~/lib/i18n/client';
import { useLazySchema } from '~/lib/form-schema';
import type { IssueBounds } from '~/lib/i18n/issue';

type Issues<K extends string> = Partial<Record<K, string>>;

/**
 * 회원정보 — 이름·연락처.
 *
 * 저장은 우리 창구로 보낸다(/api/account/profile) — 칸마다 우리 말로 된 거절 문구와, 새 이름이 머리에 곧바로 뜨도록
 * 다시 구운 세션 쿠키를 받는다. 결과는 글로 알린다: 저장이 끝나도 화면에서는 아무것도 안 사라진다.
 */
export function ProfileForm({ name, phone }: { name: string; phone: string | null }) {
  const t = useT();
  const router = useRouter();
  const issueText = useIssueText();
  const getSchema = useLazySchema(async () => (await import('@shop/contract')).updateProfileSchema);
  const [values, setValues] = useState({ name, phone: phone ?? '' });
  const [errors, setErrors] = useState<Issues<'name' | 'phone'>>({});
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: 'name' | 'phone', value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setStatus('');
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setStatus('');
    const parsed = (await getSchema()).safeParse(values);
    if (!parsed.success) {
      const next: Issues<'name' | 'phone'> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as 'name' | 'phone' | undefined;
        if (key && !next[key]) next[key] = issueText(issue.message, issue as IssueBounds);
      }
      setErrors(next);
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const body = (await response.json().catch(() => ({}))) as {
        phone?: string | null;
        fields?: Record<string, string>;
        message?: string;
      };
      if (!response.ok) {
        if (body.fields) setErrors(body.fields);
        else setFailure(body.message ?? t('acct.saveFailed'));
        return;
      }
      // 서버가 맞춘 모양(010-1234-5678)으로 칸을 갈아 둔다 — 다음에 열었을 때와 같게
      setValues((prev) => ({ ...prev, phone: body.phone ?? '' }));
      setStatus(t('acct.saved'));
      router.refresh();
    } catch {
      setFailure(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4" aria-labelledby="profile-title">
      <Field
        label={t('acct.name')}
        name="name"
        autoComplete="name"
        required
        value={values.name}
        error={errors.name}
        onChange={(e) => set('name', e.target.value)}
      />
      <Field
        label={t('acct.phone')}
        name="phone"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={values.phone}
        error={errors.phone}
        hint={t('acct.phoneHint')}
        onChange={(e) => set('phone', e.target.value)}
      />
      {failure && <p role="alert" className="text-[13px] text-accent">{failure}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t('acct.saving') : t('acct.save')}
        </Button>
        <p role="status" className="text-[13px] text-[var(--fg-secondary)]">{status}</p>
      </div>
    </form>
  );
}

type PasswordField = 'currentPassword' | 'newPassword' | 'newPasswordConfirm';

/**
 * 비밀번호 변경.
 *
 * **지금 비밀번호를 묻는다** — 로그인해 둔 기기를 잠깐 빌린 사람이 계정을 가져가지 못하게. 바꾸면 다른 기기의 세션을
 * 끊는다(revokeOtherSessions) — 비밀번호를 바꾸는 가장 흔한 이유가 "누가 내 계정에 들어온 것 같다" 다. 이 기기는
 * 로그인을 유지한다.
 *
 * 틀린 지금 비밀번호는 그 칸에 알린다. "실패했습니다" 로 뭉뚱그리면 새 비밀번호 규칙을 어긴 줄 알고 그쪽을 고친다.
 */
export function PasswordForm({ email }: { email: string }) {
  const t = useT();
  const issueText = useIssueText();
  const getSchema = useLazySchema(async () => (await import('@shop/contract')).changePasswordSchema);
  const empty = { currentPassword: '', newPassword: '', newPasswordConfirm: '' };
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Issues<PasswordField>>({});
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: PasswordField, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setStatus('');
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    setStatus('');
    const parsed = (await getSchema()).safeParse({ ...values, email });
    if (!parsed.success) {
      const next: Issues<PasswordField> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as PasswordField | undefined;
        if (key && !next[key]) next[key] = issueText(issue.message, issue as IssueBounds);
      }
      setErrors(next);
      return;
    }

    setPending(true);
    // 인증 SDK 는 누를 때 받는다 — 회원정보만 고치러 온 사람에게까지 싣지 않는다(auth-client-boundary)
    const { authClient } = await import('@shop/auth/client');
    const { error } = await authClient.changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);

    if (error) {
      if (error.status === 429) setFailure(t('auth.tooMany'));
      else if (error.code === 'INVALID_PASSWORD') setErrors({ currentPassword: t('acct.wrongCurrent') });
      else setFailure(t('acct.passwordFailed'));
      return;
    }
    // 비밀번호는 칸에 남기지 않는다 — 옆 사람이 볼 수 있고, 다시 보낼 이유도 없다
    setValues(empty);
    setStatus(t('acct.passwordChanged'));
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4" aria-labelledby="password-title">
      {/* 비밀번호 관리자가 어느 계정의 비밀번호인지 알게 한다 */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Field
        label={t('acct.currentPassword')}
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
        value={values.currentPassword}
        error={errors.currentPassword}
        onChange={(e) => set('currentPassword', e.target.value)}
      />
      <Field
        label={t('acct.newPassword')}
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        value={values.newPassword}
        error={errors.newPassword}
        hint={t('acct.passwordHint')}
        onChange={(e) => set('newPassword', e.target.value)}
      />
      <Field
        label={t('acct.newPasswordConfirm')}
        name="newPasswordConfirm"
        type="password"
        autoComplete="new-password"
        required
        value={values.newPasswordConfirm}
        error={errors.newPasswordConfirm}
        onChange={(e) => set('newPasswordConfirm', e.target.value)}
      />
      {failure && <p role="alert" className="text-[13px] text-accent">{failure}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" variant="secondary" disabled={pending}>
          {pending ? t('acct.changing') : t('acct.changePassword')}
        </Button>
        <p role="status" className="text-[13px] text-[var(--fg-secondary)]">{status}</p>
      </div>
    </form>
  );
}
