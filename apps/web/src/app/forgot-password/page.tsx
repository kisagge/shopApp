import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from '~/components/forgot-password-form';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('auth.forgotHeading'), ...NO_INDEX };
}

export default async function ForgotPasswordPage() {
  const t = await getT();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-8 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-medium tracking-tight">{t('auth.forgotHeading')}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          {t('auth.forgotLead')}
        </p>
      </div>

      <ForgotPasswordForm />

      <p className="text-center text-[13px] text-[var(--fg-muted)]">
        <Link href="/login" className="text-[var(--fg)] underline underline-offset-2">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </div>
  );
}
