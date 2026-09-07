import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MERCHANT_STATUS_LABEL } from '@shop/core';
import type { MerchantStatusInput } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { getMyApplication } from '~/lib/merchant/apply';
import { MerchantApplyForm } from '~/components/merchant-apply-form';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('merch.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'long', timeZone: 'Asia/Seoul',
});

export default async function MerchantApplyPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/merchant/apply');

  const [application, t] = await Promise.all([getMyApplication(session.id), getT()]);

  /*
   * 이미 가맹점이면 신청서를 보여 줄 이유가 없다. 어드민으로 보낸다 —
   * 여기서 할 수 있는 일이 없는데 화면만 띄우면 막다른 길이 된다.
   */
  if (session.merchantId !== null) redirect('/admin');

  const open =
    application !== null && ['PENDING', 'APPROVED', 'SUSPENDED'].includes(application.status);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-2 text-xl font-semibold tracking-tight md:text-2xl">
        {t('merch.heading')}
      </h1>
      <p className="pb-7 text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        {t('merch.lead')}
      </p>

      {open && application ? (
        <section
          aria-labelledby="status-title"
          className="flex flex-col gap-3 rounded-md border border-[var(--border)] p-6"
        >
          <h2 id="status-title" className="text-[15px] font-semibold">
            {application.name} — {MERCHANT_STATUS_LABEL[application.status as MerchantStatusInput]
              ?? application.status}
          </h2>
          <dl className="grid grid-cols-[92px_1fr] gap-y-2 text-[13px]">
            <dt className="text-[var(--fg-muted)]">{t('merch.brandSection')}</dt>
            <dd>{application.brandName ?? '—'}</dd>
            <dt className="text-[var(--fg-muted)]">{t('merch.appliedAt')}</dt>
            <dd>
              <time dateTime={application.createdAt.toISOString()}>
                {dateFormat.format(application.createdAt)}
              </time>
            </dd>
            {application.approvedAt && (
              <>
                <dt className="text-[var(--fg-muted)]">{t('merch.approvedAt')}</dt>
                <dd>
                  <time dateTime={application.approvedAt.toISOString()}>
                    {dateFormat.format(application.approvedAt)}
                  </time>
                </dd>
              </>
            )}
          </dl>

          {application.status === 'PENDING' && (
            <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
              {t('merch.pending')}
            </p>
          )}
          {application.status === 'APPROVED' && (
            <p className="text-[13px] leading-relaxed">
              {t('merch.approved')}{' '}
              {/*
                승인 직후에는 아직 고객 세션이라 어드민에 들어가지 못한다.
                다시 로그인해야 바뀐 권한이 세션에 실린다.
              */}
              {t('merch.approvedRelogin')}{' '}
              <Link href="/admin" className="underline">
                {t('merch.merchantConsole')}
              </Link>
              {t('merch.approvedTail')}
            </p>
          )}
        </section>
      ) : (
        <>
          {application?.status === 'TERMINATED' && (
            <p
              role="status"
              className="mb-6 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px]"
            >
              {t('merch.rejected')}
            </p>
          )}
          <MerchantApplyForm defaultEmail={session.email} />
        </>
      )}
    </div>
  );
}
