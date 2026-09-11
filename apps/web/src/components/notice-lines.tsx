import Link from 'next/link';
import type { SupportPostSummary } from '~/lib/queries/support';
import { getLocale } from '~/lib/i18n/server';
import { formatDate } from '@shop/i18n';

/**
 * 공지 목록의 한 줄들.
 *
 * 목록과 앞머리가 같은 모양을 쓴다 — 두 벌로 두면 한쪽만 고치게 된다.
 */
export async function NoticeLines({
  notices,
  empty,
}: {
  notices: readonly SupportPostSummary[];
  empty: string;
}) {
  const locale = await getLocale();

  if (notices.length === 0) {
    return <p className="py-10 text-[13px] text-[var(--fg-muted)]">{empty}</p>;
  }

  return (
    <ul className="mt-4 flex flex-col">
      {notices.map((notice) => (
        <li key={notice.id} className="border-b border-[var(--border)] last:border-0">
          <Link
            href={`/support/notice/${notice.id}`}
            className="flex items-baseline justify-between gap-4 py-3.5 text-[var(--fg)] no-underline hover:underline"
          >
            <span className="text-[14px]">
              {/* 고정한 공지는 눈에 띄어야 고정한 뜻이 있다 */}
              {notice.pinned && (
                <span aria-hidden="true" className="mr-1.5 text-accent">
                  ●
                </span>
              )}
              {notice.title}
            </span>
            {notice.publishedAt && (
              <time
                dateTime={notice.publishedAt.toISOString()}
                className="tnum shrink-0 text-[12px] text-[var(--fg-muted)]"
              >
                {formatDate(locale, notice.publishedAt)}
              </time>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
