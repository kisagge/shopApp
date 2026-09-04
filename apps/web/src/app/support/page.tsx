import type { Metadata } from 'next';
import Link from 'next/link';
import { getFaq, getNotices } from '~/lib/queries/support';
import { getT } from '~/lib/i18n/server';
import { TOPIC_KEY } from '~/lib/i18n/support';
import { FaqList } from '~/components/faq-list';
import { NoticeLines } from '~/components/notice-lines';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('support.heading') };
}

/** 앞머리에 보여 줄 공지 수. 다 보려면 목록으로 간다. */
const RECENT_NOTICES = 3;

export default async function SupportPage() {
  const [t, faq, notices] = await Promise.all([
    getT(),
    getFaq(),
    getNotices(RECENT_NOTICES),
  ]);

  return (
    <div className="mx-auto w-full max-w-[840px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">SUPPORT</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {t('support.heading')}
        </h1>
      </header>

      <section aria-labelledby="notice-title" className="border-t border-[var(--border)] pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="notice-title" className="text-[15px] font-semibold">
            {t('support.notice')}
          </h2>
          <Link
            href="/support/notice"
            className="text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
          >
            {t('support.noticeAll')}
          </Link>
        </div>
        <NoticeLines notices={notices} empty={t('support.noNotice')} />
      </section>

      <section aria-labelledby="faq-title" className="mt-14 border-t border-[var(--border)] pt-8">
        <h2 id="faq-title" className="text-[15px] font-semibold">
          {t('support.faq')}
        </h2>
        {faq.length === 0 ? (
          <p className="py-10 text-[13px] text-[var(--fg-muted)]">{t('support.noFaq')}</p>
        ) : (
          <div className="mt-6 flex flex-col gap-8">
            {faq.map((group) => (
              <div key={group.topic}>
                <h3 className="text-[13px] font-medium text-[var(--fg-secondary)]">
                  {t(TOPIC_KEY[group.topic])}
                </h3>
                <FaqList items={group.items} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="ask-title"
        className="mt-14 rounded-md border border-[var(--border)] bg-[var(--surface)] p-6"
      >
        <h2 id="ask-title" className="text-[15px] font-semibold">
          {t('support.askHeading')}
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('support.askLead')}
        </p>
        <Link
          href="/support/ask"
          className="mt-5 inline-flex h-11 items-center rounded-sm bg-[var(--brand)] px-6 text-sm font-medium text-[var(--bg)] no-underline"
        >
          {t('support.ask')}
        </Link>
      </section>
    </div>
  );
}
