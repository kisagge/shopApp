'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field } from '@shop/ui';
import { authClient } from '@shop/auth/client';
import { useT } from '~/lib/i18n/client';
import { useLazySchema } from '~/lib/form-schema';

export function ForgotPasswordForm() {
  const t = useT();
  const getSchema = useLazySchema(async () => (await import('@shop/contract')).forgotPasswordSchema);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sent) resultRef.current?.focus();
  }, [sent]);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const parsed = (await getSchema()).safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);

    setPending(true);
    await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: '/reset-password',
    });
    setPending(false);

    /**
     * 결과를 보지 않고 언제나 같은 말을 한다.
     *
     * 가입 화면과 반대다. 거기서는 "이미 가입된 이메일" 이라고 알려 줘야
     * 사용자가 다음 행동을 할 수 있지만, 여기서는 **아무나 이 화면에 주소를
     * 넣어 가입 여부를 확인할 수 있게 된다.** 자기 계정이 있는 사람은
     * 메일함을 보면 알고, 없는 사람은 알 필요가 없다.
     *
     * 요청 제한에 걸렸을 때도 마찬가지다. 여기서 429 를 구분해 주면 그
     * 자체가 "요청이 실제로 처리됐다" 는 신호가 된다.
     */
    setSent(true);
  }

  if (sent) {
    /*
     * **결과가 폼을 대신하므로 초점을 옮긴다.**
     *
     * 동작과 동시에 생긴 라이브 영역은 낭독기가 놓치는 일이 흔하다 — 삽입 전부터 있던 영역이라야
     * 안정적으로 읽힌다. 게다가 제출 단추가 사라져 초점이 <body> 로 떨어진다. 여기서는 패널 자체에
     * 초점을 옮겨 "메일을 보냈습니다" 를 확실히 읽히게 하고, 키보드 사용자의 자리도 지킨다.
     */
    return (
      <div
        ref={resultRef}
        role="status"
        tabIndex={-1}
        className="flex flex-col gap-3 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-5 focus:outline-none">
        <p className="text-sm font-medium">{t('auth.mailSent')}</p>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('auth.mailSentDetail', { email })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-5" noValidate>
      <Field
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        required
        value={email}
        error={fieldError}
        onChange={(e) => { setEmail(e.target.value); setFieldError(undefined); }}
      />
      <Button type="submit" block aria-disabled={pending}>
        {pending ? t('auth.forgotSending') : t('auth.forgotSubmit')}
      </Button>
    </form>
  );
}
