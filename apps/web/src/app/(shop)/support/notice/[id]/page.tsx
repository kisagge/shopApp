import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatDate } from '@shop/i18n';
import { getNotice } from '~/lib/queries/support';
import { getLocale, getT } from '~/lib/i18n/server';
import { RichText } from '~/components/rich-text';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const notice = await getNotice(id);
  return { title: notice?.title ?? (await getT())('support.notice') };
}

export default async function NoticePage({ params }: Params) {
  const { id } = await params;
  const [notice, locale, t] = await Promise.all([getNotice(id), getLocale(), getT()]);

  // 내보내지 않은 공지는 조회가 걸러 준다. 주소를 알아도 열리지 않는다.
  if (!notice) notFound();

  return (
    <article className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <header className="border-b border-[var(--border)] py-8">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{notice.title}</h1>
        {notice.publishedAt && (
          <time
            dateTime={notice.publishedAt.toISOString()}
            className="tnum mt-2 block text-[12px] text-[var(--fg-muted)]"
          >
            {formatDate(locale, notice.publishedAt)}
          </time>
        )}
      </header>

      {/* 나무가 없는 옛 글은 평문 그대로 — 서식이 생기기 전에 쓴 글도 읽혀야 한다 */}
      {notice.bodyRich ? (
        <RichText doc={notice.bodyRich} className="pt-8" />
      ) : (
        <p className="whitespace-pre-wrap pt-8 text-[15px] leading-loose text-[var(--fg-secondary)]">
          {notice.body}
        </p>
      )}

      <p className="pt-12">
        <Link
          href="/support/notice"
          className="inline-flex h-11 items-center rounded-sm border border-[var(--border-strong)] px-5 text-[13px] text-[var(--fg)] no-underline"
        >
          {t('support.backToList')}
        </Link>
      </p>
    </article>
  );
}
