import type { Metadata } from 'next';
import Link from 'next/link';
import { googleEnabled, googleNativeClientIds } from '@shop/auth';
import { safeNextPath } from '@shop/core';
import { LoginForm } from '~/components/login-form';
import { GoogleButton, OrDivider } from '~/components/google-button';
import type { MessageKey } from '@shop/i18n';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('auth.login'), ...NO_INDEX };
}

/**
 * 소셜 로그인이 실패했을 때 인증 서버가 붙여 보내는 코드.
 *
 * 모르는 코드까지 하나하나 옮기지 않는다. 다만 **연결 거부만은 반드시
 * 따로 말해 준다** — 그 사용자는 "구글로 로그인했는데 안 된다" 는 상태에
 * 갇히고, 무엇을 해야 하는지 짐작할 방법이 없다.
 */
const SOCIAL_ERROR_KEY: Record<string, MessageKey> = {
  account_not_linked: 'auth.googleUsePassword',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; next?: string; error?: string }>;
}) {
  const { reset, next: rawNext, error } = await searchParams;
  // 주소에 실린 값이다 — 우리 사이트 안의 경로만 받는다(core 의 safeNextPath)
  const next = safeNextPath(rawNext);
  const t = await getT();
  const socialError = error
    ? t(SOCIAL_ERROR_KEY[error] ?? 'auth.googleFailedShort')
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t('auth.login')}</h1>
        {/*
          **가맹점 계정도 적는다.** 구매자 계정만 있으면 둘러보러 온 사람은 가맹점 화면(자기
          상품만 보이는 범위, 송장 일괄 등록, 재고 알림)을 볼 길이 없다 — 이 저장소에서 가장
          공들인 자리가 로그인 벽 뒤에 숨는다.

          운영진 계정은 적지 않는다. 권한 부여·환불·정산 지급을 누구나 누를 수 있게 되면
          다음에 온 사람이 망가진 가게를 본다. 가맹점은 자기 상품만 건드린다.

          비밀번호는 비밀이 아니다 — 시드에 그대로 적혀 있고 README 에도 있다.
        */}
        <section aria-labelledby="demo-accounts" className="rounded-sm bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--fg-muted)]">
          <h2 id="demo-accounts" className="font-medium text-[var(--fg-secondary)]">{t('auth.devAccount')}</h2>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>{t('auth.devCustomer')}</dt>
            <dd className="min-w-0 break-all">
              <code className="tnum">demo@plain.test</code> / <code className="tnum">plain1234!</code>
            </dd>
            <dt>{t('auth.devMerchant')}</dt>
            <dd className="min-w-0 break-all">
              <code className="tnum">contact@moor.test</code> / <code className="tnum">plain1234!</code>
            </dd>
          </dl>
          <p className="mt-1.5 text-[12px]">{t('auth.devMerchantHint')}</p>
        </section>
      </div>

      {reset === '1' && (
        // 비밀번호를 바꾸면 세션이 끊긴다. 왜 다시 로그인해야 하는지 말해 준다.
        <p role="status" className="rounded-sm bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--fg-secondary)]">
          {t('auth.passwordChanged')}
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

      <LoginForm next={next} />

      <p className="text-center text-[13px]">
        <Link href="/forgot-password" className="text-[var(--fg-muted)] underline underline-offset-2">
          {t('auth.forgot')}
        </Link>
      </p>

      <p className="text-center text-[13px] text-[var(--fg-muted)]">
        {t('auth.noAccount')}{' '}
        <Link href="/signup" className="text-[var(--fg)] underline underline-offset-2">
          {t('auth.signup')}
        </Link>
      </p>
    </div>
  );
}
