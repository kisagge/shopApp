import type { Metadata } from 'next';
import { getNotices } from '~/lib/queries/support';
import { getT } from '~/lib/i18n/server';
import { NoticeLines } from '~/components/notice-lines';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('support.notice') };
}

export default async function NoticeListPage() {
  const [t, notices] = await Promise.all([getT(), getNotices()]);

  return (
    <div className="mx-auto w-full max-w-[840px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">SUPPORT</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">
          {t('support.notice')}
        </h1>
      </header>

      <NoticeLines notices={notices} empty={t('support.noNotice')} />
    </div>
  );
}
