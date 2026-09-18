import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MERCHANT_STATUS_LABEL, type MerchantStatus } from '@shop/core';
import { prisma } from '@shop/db';
import { getNavUser } from '~/lib/viewer';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('merchSuspended.heading'), ...NO_INDEX };
}

/**
 * 가맹점 운영이 멈췄다고 말하는 화면.
 *
 * **정지된 가맹점의 계정은 말없이 첫 화면으로 튕겼다.** 콘솔 가드가 "권한 없음" 을 감추느라 그랬는데(어드민 경로의
 * 존재를 확인해 주지 않으려고), 이 사람은 어제까지 그 경로를 쓰던 사람이라 감출 것이 없다. 감추기만 하면 로그인이
 * 깨진 줄 알고 다시 로그인하거나 "화면이 안 열린다" 고 묻게 된다.
 *
 * 무엇이 그대로인지(주문·상품·정산), 지금 무엇을 할 수 있는지(손님으로 쓰기), 어디에 물어야 하는지를 적는다.
 */
export default async function MerchantSuspendedPage() {
  const user = await getNavUser();
  if (!user) redirect('/login?next=/merchant/suspended');
  // 멀쩡한 가맹점·손님이 주소를 치고 들어오면 보여 줄 것이 없다
  if (!user.merchantBlocked || user.blockedMerchantId === null) redirect('/');

  const [merchant, t] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: user.blockedMerchantId },
      select: { name: true, status: true, suspendedReason: true },
    }),
    getT(),
  ]);

  // 가맹점 행이 사라졌어도 화면은 선다 — 여기까지 온 사람은 어떻든 콘솔이 닫힌 사람이다
  const status: MerchantStatus = merchant?.status ?? 'SUSPENDED';

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-2 text-xl font-semibold tracking-tight md:text-2xl">
        {t('merchSuspended.heading')}
      </h1>

      <section
        aria-labelledby="suspended-title"
        className="mt-4 flex flex-col gap-3 rounded-md border border-[var(--border)] p-6"
      >
        <h2 id="suspended-title" className="text-[15px] font-semibold">
          {merchant?.name ?? '—'} — {MERCHANT_STATUS_LABEL[status]}
        </h2>
        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('merchSuspended.lead', { merchant: merchant?.name ?? '—', status: MERCHANT_STATUS_LABEL[status] })}
        </p>
        {/*
          **까닭을 적는다.** 처분에는 사유를 받아 왔는데 그 글이 감사 로그에만 남아, 멈춘 쪽은 "무엇을 고치면
          되는지" 를 물어야만 알 수 있었다. 줄바꿈을 살린다 — 운영자가 여러 줄로 적는 칸이다.
        */}
        {merchant?.suspendedReason && (
          <div className="rounded-sm bg-[var(--surface)] px-4 py-3">
            <h3 className="text-[12px] font-semibold text-[var(--fg-muted)]">{t('merchSuspended.reason')}</h3>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed">{merchant.suspendedReason}</p>
          </div>
        )}

        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('merchSuspended.what')}
        </p>

        <div className="mt-2 flex flex-wrap gap-3">
          <Link
            href="/support/ask"
            className="inline-flex h-11 items-center rounded-sm bg-[var(--brand)] px-5 text-[13px] font-medium text-[var(--bg)] no-underline"
          >
            {t('merchSuspended.ask')}
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-sm border border-[var(--border)] px-5 text-[13px] no-underline"
          >
            {t('merchSuspended.shop')}
          </Link>
        </div>
      </section>
    </div>
  );
}
