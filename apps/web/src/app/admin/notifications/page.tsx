import type { Metadata } from 'next';
import Link from 'next/link';
import { formatDateTime } from '@shop/i18n';
import { CONSOLE_NEWS_KIND, LOW_STOCK_THRESHOLD } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { countUnread, getMyNotifications, NOTIFICATION_PAGE_SIZE } from '~/lib/queries/notifications';
import { PageNav } from '~/components/page-nav';
import { getLocale, getT } from '~/lib/i18n/server';
import { notificationText } from '~/lib/i18n/notification';
import { getNotificationTemplates } from '~/lib/notifications/templates';
import { MarkReadButton } from './mark-read-button';
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
 * **열었다고 할 일이 끝나지는 않는다.** 여기에는 할 일(반품 신청·문의·입점 신청·재고)과 소식(검수
 * 결과·정산)이 섞여 있다. 한 번 열면 전부 읽음이 되던 때에는 뱃지의 숫자가 "할 일이 몇 개" 가 아니라
 * "들여다봤는가" 가 됐고, 아직 처리하지 않은 일은 목록을 훑어 기억하는 수밖에 없었다 — 코드가 끝난 일을
 * 닫아 주는 것(markNoticesDone)과 짝을 이루려면 사람도 자기 손으로 닫을 수 있어야 한다.
 *
 * **소식은 열면 읽힌다.** 아무도 "닫을" 일이 아니라서 그대로 두면 영영 안 읽음으로 쌓이고(보존 규칙은
 * 읽은 것만 지운다) 뱃지는 다시 아무도 보지 않는 숫자가 된다. 어느 종류가 소식인지는 서버가 정한다.
 */
export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; unread?: string }>;
}) {
  const actor = await requireAdmin('admin:access');

  const { page: pageParam, unread } = await searchParams;
  // 주소에 아무 값이나 들어올 수 있다. 아는 값만 필터로 쓴다
  const unreadOnly = unread === '1';
  // 범위를 벗어난 값은 core 가 당긴다(pageNav). 여기서는 숫자로만 만든다.
  const page = Math.max(Number.parseInt(pageParam ?? '1', 10) || 1, 1);

  const [notifications, unreadCount, locale, t] = await Promise.all([
    getMyNotifications(actor.id, 'console', page, unreadOnly),
    // 탭에 붙는 수. 머리의 뱃지와 같은 함수를 쓴다 — 따로 세면 뱃지는 3 인데 들어가면 2 건인 날이 온다
    countUnread(actor.id, 'console'),
    getLocale(),
    getT(),
  ]);
  const items = notifications.rows;
  // 운영이 고친 문구. 이미 온 알림도 이것으로 읽힌다 — 알림에는 문장이 아니라 값만 저장한다
  const templates = await getNotificationTemplates(locale);
  // 사람이 닫을 수 있는 것 — 이 쪽에 보이는 안 읽은 줄
  const unreadIds = items.filter((n) => n.unread).map((n) => n.id);
  /*
   * 안 읽은 **소식**이 있을 때만 창구를 부른다. 할 일만 남았으면 부를 일이 없다 — 어느 쪽이든
   * 서버가 소식만 읽지만, 아무것도 바뀌지 않을 요청을 화면이 열릴 때마다 보낼 이유가 없다.
   */
  const hasUnreadNews = items.some(
    (n) => n.unread && (CONSOLE_NEWS_KIND as readonly string[]).includes(n.kind),
  );

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 id="console-notif-heading" className="text-[19px] font-semibold tracking-tight">
          알림
        </h1>
        {/*
          이 알림함에 무엇이 오는지 적는다. 한동안 재고 부족 하나뿐이라 그 기준만
          적혀 있었는데, 검수 결과가 더해졌다 — 비워 두면 왜 여기 떴는지 모른다.
          기준값은 손으로 적지 않는다: 대시보드·상품 화면과 같은 곳에서 온다.
        */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-[13px] text-[var(--fg-muted)]">
            상품 검수 결과와, 옵션 재고가 <b className="tnum">{LOW_STOCK_THRESHOLD}개</b> 이하로
            내려간 것을 알려 드립니다
          </p>
          {/*
            **이 쪽에 보이는 것만 닫는다.** "모두" 가 안 보이는 뒤쪽까지 뜻하면, 서른한 번째 할 일이
            읽은 적도 없이 사라진다 — 읽음은 되돌릴 수 없다.
          */}
          <MarkReadButton
            ids={unreadIds}
            label={`이 쪽의 안 읽은 알림 ${unreadIds.length}건 모두 읽음 처리`}
            variant="all"
          />
        </div>
      </header>


      {/* 소식은 열면 읽힌다. 할 일은 남는다 — 어느 종류가 어느 쪽인지는 서버가 정한다 */}
      {hasUnreadNews && <MarkNotificationsRead box="console" />}

      <div className="p-4 sm:p-8">
        {/*
          **읽은 줄 사이에서 남은 일을 찾을 길이 있어야 한다.** 이 알림함은 열어도 할 일이 읽음이
          되지 않으므로, 끝난 것과 지나간 소식이 쌓이는 사이에 남은 일이 묻힌다 — 문의 대기줄이
          쓰는 모양을 그대로 따른다(탭에 수를 달고, 그 수는 머리의 뱃지와 같은 함수에서 온다).
        */}
        <nav aria-label="알림 보기" className="mb-4 flex gap-1 border-b border-[var(--border)]">
          {([false, true] as const).map((only) => (
            <Link
              key={String(only)}
              href={{
                pathname: '/admin/notifications',
                ...(only ? { query: { unread: '1' } } : {}),
              }}
              aria-current={unreadOnly === only ? 'page' : undefined}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13px] no-underline ${
                unreadOnly === only
                  ? 'border-[var(--brand)] font-medium text-[var(--fg)]'
                  : 'border-transparent text-[var(--fg-secondary)] hover:text-[var(--fg)]'
              }`}
            >
              {only ? '안 읽음' : '전체'}
              {only && unreadCount > 0 && <span className="tnum ml-1.5 text-accent">{unreadCount}</span>}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-16 text-center text-[13px] text-[var(--fg-muted)]">
            {unreadOnly ? '안 읽은 알림이 없습니다. 남은 할 일이 없다는 뜻입니다.' : '새 알림이 없습니다.'}
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
                /*
                  **단추는 링크 밖에 선다.** 링크 안에 단추를 넣으면 안 되고(중첩), 무엇보다 할 일을
                  보러 가는 것과 할 일을 닫는 것은 다른 동작이다 — 한 자리에 두면 보러 누른 사람이
                  닫아 버린다.
                */
                <li
                  key={n.id}
                  className="flex items-start gap-2 border-b border-[var(--border)] pr-4 last:border-0"
                >
                  {n.linkPath ? (
                    <Link
                      href={{ pathname: n.linkPath }}
                      className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-4 text-[var(--fg)] no-underline hover:bg-[var(--surface)]"
                    >
                      {body}
                    </Link>
                  ) : (
                    <p className="flex min-w-0 flex-1 items-start gap-2.5 px-4 py-4">{body}</p>
                  )}
                  {n.unread && (
                    <span className="flex min-h-13 items-center py-4">
                      {/* 무엇을 닫는지 이름에 담는다 — "읽음, 단추" 가 열 번 읽히면 누를 수 없다 */}
                      <MarkReadButton ids={[n.id]} label={`${text} 읽음 처리`} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 서른 개 뒤로 갈 길이 없었다 — 운영 목록과 같은 셈법을 쓴다 */}
        <PageNav
          page={page}
          total={notifications.total}
          pageSize={NOTIFICATION_PAGE_SIZE}
          /* 필터를 유지한 채 쪽을 넘긴다 — 빠뜨리면 넘기는 순간 조건이 풀린다(상품 목록과 같다) */
          hrefOf={(n) => ({
            pathname: '/admin/notifications',
            ...(unreadOnly || n > 1
              ? { query: { ...(unreadOnly ? { unread: '1' } : {}), ...(n > 1 ? { page: String(n) } : {}) } }
              : {}),
          })}
        />
      </div>
    </>
  );
}
