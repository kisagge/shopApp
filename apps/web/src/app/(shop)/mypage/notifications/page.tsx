import type { Metadata } from 'next';
import { getViewer } from '~/lib/viewer';
import { TrackedLink as Link } from '~/components/tracked-link';
import { redirect } from 'next/navigation';
import { formatDateTime } from '@shop/i18n';
import { getMyNotifications, NOTIFICATION_PAGE_SIZE } from '~/lib/queries/notifications';
import { PageNav } from '~/components/page-nav';
import { getLocale, getT } from '~/lib/i18n/server';
import { notificationText } from '~/lib/i18n/notification';
import { getNotificationTemplates } from '~/lib/notifications/templates';
import { MarkNotificationsRead } from '~/components/mark-notifications-read';
import { NO_INDEX } from '~/lib/no-index';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('notif.heading'), ...NO_INDEX };
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/notifications');

  const { page: pageParam } = await searchParams;
  // 범위를 벗어난 값은 core 가 당긴다(pageNav). 여기서는 숫자로만 만든다.
  const page = Math.max(Number.parseInt(pageParam ?? '1', 10) || 1, 1);

  const [notifications, locale, t] = await Promise.all([
    getMyNotifications(user.id, 'customer', page),
    getLocale(),
    getT(),
  ]);
  const items = notifications.rows;
  // 운영이 고친 문구. 이미 온 알림도 이것으로 읽힌다 — 알림에는 문장이 아니라 값만 저장한다
  const templates = await getNotificationTemplates(locale);

  const hadUnread = items.some((n) => n.unread);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <nav aria-label={t('nav.breadcrumb')}>
          <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
            {t('nav.mypage')}
          </Link>
        </nav>
        <h1 id="notif-heading" className="text-xl font-semibold tracking-tight md:text-2xl">
          {t('notif.heading')}
        </h1>
      </header>

      {/*
        읽음 표시는 화면이 뜬 뒤에 보낸다.
        **이 화면이 이미 그려진 뒤라, 무엇이 새것이었는지는 그대로 보인다** —
        열자마자 표시가 사라지면 무엇이 새 소식인지 알 수 없다.
      */}
      {hadUnread && <MarkNotificationsRead />}

      {/*
        목록에 이름을 준다. 없으면 보조 기술이 "목록, 항목 3개" 라고만 읽어
        주고 무엇의 목록인지는 말하지 않는다. 제목이 이미 있으므로 문구를
        새로 만들지 않고 그것을 가리킨다.
      */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-24 text-center">
          <p className="text-[15px] font-medium">{t('notif.empty')}</p>
          <p className="text-[13px] text-[var(--fg-muted)]">{t('notif.emptyHint')}</p>
        </div>
      ) : (
        <ul aria-labelledby="notif-heading" className="flex flex-col">
          {items.map((n) => {
            const text = notificationText(t, n.kind, n.params, templates.get(n.kind));
            const when = (
              <time
                dateTime={n.createdAt.toISOString()}
                className="tnum mt-1 block text-[11px] text-[var(--fg-muted)]"
              >
                {formatDateTime(locale, n.createdAt)}
              </time>
            );

            return (
              <li key={n.id} className="border-b border-[var(--border)]">
                {n.linkPath ? (
                  <Link
                    href={{ pathname: n.linkPath }}
                    className="flex items-start gap-2.5 py-4 text-[var(--fg)] no-underline"
                  >
                    <Unread on={n.unread} label={t('notif.unread')} />
                    <span className="flex-1">
                      <span className="block text-[14px] leading-relaxed">{text}</span>
                      {when}
                    </span>
                  </Link>
                ) : (
                  <p className="flex items-start gap-2.5 py-4">
                    <Unread on={n.unread} label={t('notif.unread')} />
                    <span className="flex-1">
                      <span className="block text-[14px] leading-relaxed">{text}</span>
                      {when}
                    </span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        **서른한 번째 알림은 볼 길이 없었다.** 서른 개를 잘라 오고 그게 끝이라,
        그 아래는 주소로도 못 갔다 — 알림은 지워지지도 않으니 쌓이기만 했다.
        운영 목록과 같은 셈법을 쓴다(core 의 pagination).
      */}
      <PageNav
        page={page}
        total={notifications.total}
        pageSize={NOTIFICATION_PAGE_SIZE}
        hrefOf={(n) => ({
          pathname: '/mypage/notifications',
          ...(n === 1 ? {} : { query: { page: String(n) } }),
        })}
      />
    </div>
  );
}

/** 안 읽음을 **색이 아니라 글로도** 알린다 */
function Unread({ on, label }: { on: boolean; label: string }) {
  if (!on) return <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0" />;
  return (
    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent">
      <span className="sr-only">{label}</span>
    </span>
  );
}
