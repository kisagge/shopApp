'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { authClient } from '@shop/auth/client';
import { track } from '~/lib/analytics/client';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);

    const { error: authError } = await authClient.signIn.email({ email, password });

    setPending(false);
    if (authError) {
      // 어느 쪽이 틀렸는지 알려 주지 않는다. 가입된 이메일을 확인해 주는 셈이 된다.
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      return;
    }
    track('login', { method: 'email' });
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-5" noValidate>
      <Field
        label="이메일"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="비밀번호"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {/* 폼 전체 에러는 제출 버튼 위에 두고 role=alert 로 즉시 읽히게 한다 */}
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <Button type="submit" block aria-disabled={pending}>
        {pending ? '로그인 중…' : '로그인'}
      </Button>
    </form>
  );
}
