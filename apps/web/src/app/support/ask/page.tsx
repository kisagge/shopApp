import type { Metadata } from 'next';
import { getViewer } from '~/lib/viewer';
import Link from 'next/link';
import { getT } from '~/lib/i18n/server';
import { SupportAskForm } from '~/components/support-ask-form';
import { NO_INDEX } from '~/lib/no-index';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('support.askHeading'), ...NO_INDEX };
}

export default async function AskPage() {
  const [t, viewer] = await Promise.all([getT(), getViewer()]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 border-b border-[var(--border)] py-8">
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {t('support.askHeading')}
        </h1>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('support.askLead')}
        </p>
      </header>

      <div className="pt-8">
        {viewer ? (
          <SupportAskForm />
        ) : (
          /*
           * 익명으로 열지 않는다. 누구에게 답할지 알 수 없고, 답이 왔다고
           * 알려 줄 방법도 없다 — 상품 문의와 같은 규칙이다.
           */
          <p className="flex flex-col items-start gap-4 py-10">
            <span className="text-[14px] text-[var(--fg-secondary)]">
              {t('support.askLogin')}
            </span>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-sm bg-[var(--brand)] px-6 text-sm font-medium text-[var(--bg)] no-underline"
            >
              {t('nav.login')}
            </Link>
          </p>
        )}
      </div>

      <p className="pt-10">
        <Link
          href="/mypage/inquiries"
          className="text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
        >
          {t('support.myInquiries')}
        </Link>
      </p>
    </div>
  );
}
