import Link from 'next/link';
import { getViewer } from '~/lib/viewer';
import { formatUnread } from '@shop/core';
import { countUnread } from '~/lib/queries/notifications';
import { getT } from '~/lib/i18n/server';

/**
 * 머리의 알림 종.
 *
 * **서버에서 센다.** 예전에는 헤더가 세션을 읽지 않았다 — 그러면 헤더를
 * 쓰는 모든 화면이 동적 렌더링으로 묶이기 때문이었다. 지금은 레이아웃이
 * 요청의 언어를 읽으므로 어차피 모든 화면이 동적이고, 그 이유가 더는
 * 성립하지 않는다. 브라우저에서 한 번 더 물어보는 왕복을 아낀다.
 *
 * 로그인하지 않았으면 아무것도 그리지 않는다.
 */
export async function NotificationBell() {
  const user = await getViewer();
  if (!user) return null;

  const [unread, t] = await Promise.all([countUnread(user.id), getT()]);

  return (
    <Link
      href="/mypage/notifications"
      aria-label={unread > 0 ? t('notif.bellUnread', { count: unread }) : t('notif.bell')}
      className="relative inline-flex h-9 shrink-0 items-center text-[var(--fg-secondary)] no-underline"
    >
      {/* 아이콘은 장식이다 — 이름과 개수는 링크가 말한다 */}
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4.5-1.5 5h12c-.5-.5-1.5-2-1.5-5A4.5 4.5 0 0 0 10 3Z" />
        <path d="M8.5 15a1.6 1.6 0 0 0 3 0" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="tnum absolute -top-0.5 -right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-[var(--bg)]"
        >
          {formatUnread(unread)}
        </span>
      )}
    </Link>
  );
}
