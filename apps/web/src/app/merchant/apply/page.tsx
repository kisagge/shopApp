import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { MERCHANT_STATUS_LABEL, type MerchantStatusInput } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { getMyApplication } from '~/lib/merchant/apply';
import { MerchantApplyForm } from '~/components/merchant-apply-form';

export const metadata: Metadata = { title: '입점 신청' };
export const dynamic = 'force-dynamic';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'long', timeZone: 'Asia/Seoul',
});

export default async function MerchantApplyPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/merchant/apply');

  const application = await getMyApplication(session.id);

  /*
   * 이미 가맹점이면 신청서를 보여 줄 이유가 없다. 어드민으로 보낸다 —
   * 여기서 할 수 있는 일이 없는데 화면만 띄우면 막다른 길이 된다.
   */
  if (session.merchantId !== null) redirect('/admin');

  const open =
    application !== null && ['PENDING', 'APPROVED', 'SUSPENDED'].includes(application.status);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-2 text-xl font-semibold tracking-tight md:text-2xl">입점 신청</h1>
      <p className="pb-7 text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        PLAIN 은 한 매대에 여러 브랜드를 올리는 편집숍입니다. 신청해 주시면 운영진이 확인한
        뒤 알려 드립니다.
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
            <dt className="text-[var(--fg-muted)]">브랜드</dt>
            <dd>{application.brandName ?? '—'}</dd>
            <dt className="text-[var(--fg-muted)]">신청일</dt>
            <dd>
              <time dateTime={application.createdAt.toISOString()}>
                {dateFormat.format(application.createdAt)}
              </time>
            </dd>
            {application.approvedAt && (
              <>
                <dt className="text-[var(--fg-muted)]">승인일</dt>
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
              심사 중입니다. 결과는 적어 주신 이메일로 알려 드립니다.
            </p>
          )}
          {application.status === 'APPROVED' && (
            <p className="text-[13px] leading-relaxed">
              승인되었습니다.{' '}
              {/*
                승인 직후에는 아직 고객 세션이라 어드민에 들어가지 못한다.
                다시 로그인해야 바뀐 권한이 세션에 실린다.
              */}
              다시 로그인하시면{' '}
              <Link href="/admin" className="underline">
                가맹점 화면
              </Link>
              을 쓰실 수 있습니다.
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
              지난 신청은 반려되었습니다. 내용을 고쳐 다시 신청하실 수 있습니다.
            </p>
          )}
          <MerchantApplyForm defaultEmail={session.email} />
        </>
      )}
    </div>
  );
}
