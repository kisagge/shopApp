import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateTime } from '@shop/i18n';
import { LOW_STOCK_THRESHOLD } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getMyNotifications } from '~/lib/queries/notifications';
import { getLocale, getT } from '~/lib/i18n/server';
import { notificationText } from '~/lib/i18n/notification';
import { getNotificationTemplates } from '~/lib/notifications/templates';
import { MarkNotificationsRead } from '~/components/mark-notifications-read';

export const metadata: Metadata = { title: '알림' };
export const dynamic = 'force-dynamic';

/**
 * 운영 알림함.
 *
 * **매장 알림함과 표는 같고 보는 칸이 다르다.** 가맹점 계정도 사용자라 두 곳에
 * 다 들어가는데, 매장에서는 손님 알림만, 여기서는 운영 알림만 본다 — 어느 것이
 * 어디에 속하는지는 core 의 CONSOLE_NOTIFICATION_KIND 가 정한다.
 *
 * 지금은 재고 부족 하나뿐이다. 대시보드에도 "재고 부족" 이 뜨지만 **열어야
 * 안다** — 품절은 곧바로 매출 손실이고, 재입고에는 며칠이 걸린다.
 */
export default async function AdminNotificationsPage() {
  const actor = await requireAdmin('admin:access');

  const [items, locale, t] = await Promise.all([
    getMyNotifications(actor.id, 'console'),
    getLocale(),
    getT(),
  ]);
  // 운영이 고친 문구. 이미 온 알림도 이것으로 읽힌다 — 알림에는 문장이 아니라 값만 저장한다
  const templates = await getNotificationTemplates(locale);
  const hadUnread = items.some((n) => n.unread);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 id="console-notif-heading" className="text-[19px] font-semibold tracking-tight">
          알림
        </h1>
        {/* 기준값을 손으로 적지 않는다 — 대시보드·상품 화면과 같은 곳에서 온다 */}
        <p className="text-[13px] text-[var(--fg-muted)]">
          옵션 재고가 <b className="tnum">{LOW_STOCK_THRESHOLD}개</b> 이하로 내려가면 알려 드립니다
        </p>
      </header>

      {/*
        **읽음은 이 알림함의 것만.** 매장 알림함을 열었다고 여기 것까지 읽음이
        되면, 가맹점이 매장에 들렀다 가는 것만으로 재고 알림 뱃지가 사라진다.
      */}
      {hadUnread && <MarkNotificationsRead box="console" />}

      <div className="p-4 sm:p-8">
        {items.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-16 text-center text-[13px] text-[var(--fg-muted)]">
            새 알림이 없습니다.
          </p>
        ) : (
          <ul
            aria-labelledby="console-notif-heading"
            className="flex flex-col rounded-md border border-[var(--border)] bg-[var(--bg)]"
          >
            {items.map((n) => {
              const text = notificationText(t, n.kind, n.params, templates.get(n.kind));
              const body = (
                <>
                  {/*
                    안 읽음을 **점 하나로만** 알리지 않는다. 색이 안 보이는 사람에게
                    점은 아무 말도 하지 않는다.
                  */}
                  {n.unread ? (
                    <span className="mt-1.5 inline-flex shrink-0 items-center gap-1.5">
                      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />
                      <span className="sr-only">안 읽음</span>
                    </span>
                  ) : (
                    <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0" />
                  )}
                  <span className="flex-1">
                    <span className="block text-[14px] leading-relaxed">{text}</span>
                    <time
                      dateTime={n.createdAt.toISOString()}
                      className="tnum mt-1 block text-[11px] text-[var(--fg-muted)]"
                    >
                      {formatDateTime(locale, n.createdAt)}
                    </time>
                  </span>
                </>
              );

              return (
                <li key={n.id} className="border-b border-[var(--border)] last:border-0">
                  {n.linkPath ? (
                    <Link
                      href={{ pathname: n.linkPath }}
                      className="flex items-start gap-2.5 px-4 py-4 text-[var(--fg)] no-underline hover:bg-[var(--surface)]"
                    >
                      {body}
                    </Link>
                  ) : (
                    <p className="flex items-start gap-2.5 px-4 py-4">{body}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
