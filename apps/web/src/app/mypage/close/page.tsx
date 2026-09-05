import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CLOSURE_EFFECT } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { inspectClosure } from '~/lib/account/close-account';
import { CloseAccountForm } from '~/components/close-account-form';
import type { MessageKey } from '@shop/i18n';
import { getT } from '~/lib/i18n/server';
import { CLOSURE_BLOCK_KEY } from '~/lib/i18n/closure';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('close.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function CloseAccountPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage/close');

  /*
   * 막히는지를 **화면에서 먼저 본다.**
   *
   * 다 적고 확인 문구까지 친 뒤에 "배송 중인 주문이 있습니다" 를 받으면
   * 그 시간이 통째로 헛것이 된다. API 도 같은 함수로 다시 본다 — 여기서만
   * 막으면 주소를 직접 부르는 요청이 그대로 통과한다.
   */
  const [check, t] = await Promise.all([inspectClosure(session.id), getT()]);

  const erased = CLOSURE_EFFECT.filter((e) => e.how === 'erase');
  const kept = CLOSURE_EFFECT.filter((e) => e.how === 'keep');

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label={t('nav.breadcrumb')} className="pt-8 text-xs text-[var(--fg-muted)]">
        <Link href="/mypage" className="no-underline hover:underline">
          {t('nav.mypage')}
        </Link>
        <span aria-hidden="true"> › </span>
        <span>{t('close.heading')}</span>
      </nav>

      <h1 className="pt-3 pb-5 text-xl font-semibold tracking-tight md:text-2xl">
        {t('close.heading')}
      </h1>

      {!check.allowed && (
        <section
          aria-labelledby="blocked-title"
          className="mb-7 rounded-sm border border-accent/40 bg-accent/8 p-5"
        >
          <h2 id="blocked-title" className="text-[14px] font-semibold text-accent">
            {t('close.blocked')}
          </h2>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {check.blocks.map((block) => (
              <li key={block} className="text-[13px] leading-relaxed">
                {t(CLOSURE_BLOCK_KEY[block])}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="effect-title" className="flex flex-col gap-5">
        <h2 id="effect-title" className="text-[15px] font-semibold">
          {t('close.whatHappens')}
        </h2>

        <div className="rounded-sm border border-[var(--border)] p-5">
          <h3 className="text-[13px] font-semibold">{t('close.removed')}</h3>
          <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
            {erased.map((effect) => (
              <li key={effect.id} className="text-[13px] leading-relaxed">
                {t(`closure.${effect.id}` as MessageKey)}
                {effect.explains && (
                  <span className="block text-[12px] text-[var(--fg-muted)]">
                    {t(`closure.${effect.id}Why` as MessageKey)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-sm border border-[var(--border)] p-5">
          <h3 className="text-[13px] font-semibold">{t('close.kept')}</h3>
          <ul className="mt-2.5 flex list-none flex-col gap-2 p-0">
            {kept.map((effect) => (
              <li key={effect.id} className="text-[13px] leading-relaxed">
                {t(`closure.${effect.id}` as MessageKey)}
                <span className="block text-[12px] text-[var(--fg-muted)]">
                  {t(`closure.${effect.id}Why` as MessageKey)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('close.rejoin')}
        </p>
      </section>

      {check.allowed && <CloseAccountForm />}
    </div>
  );
}
