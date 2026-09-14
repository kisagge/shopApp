import 'server-only';
import { prisma } from '@shop/db';
import {
  CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND, type NotificationKind,
} from '@shop/core';

/**
 * 내 알림.
 *
 * **캐싱하지 않는다.** 사람마다 다른 값이라 캐시에 들어가면 한 사람의
 * 화면이 다음 사람에게 그대로 나간다.
 */

export interface NotificationView {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly params: Record<string, string>;
  readonly linkPath: string | null;
  readonly unread: boolean;
  readonly createdAt: Date;
}

const PAGE_SIZE = 30;

/**
 * 눌렀을 때 갈 곳.
 *
 * **우리 경로만 받는다.** 지금은 서버가 만들어 넣는 값뿐이지만, 표에 담긴
 * 문자열을 그대로 링크에 꽂는 자리다 — 나중에 어딘가에서 바깥 주소가 들어오면
 * 우리 도메인이 남의 사이트로 보내 주는 발판이 된다. 언어 바꾸기에서 배운
 * 것과 같은 자리이고, 확인하는 값이 붙이는 값보다 싸다.
 */
function safeLink(value: string | null): string | null {
  if (value === null) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

/** 문구에 끼울 값. 저장된 것은 무엇이든 올 수 있으니 문자열만 받는다. */
function paramsOf(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

/**
 * 어느 알림함인가. 매장은 손님 알림만, 운영 화면은 운영 알림만 본다.
 *
 * **가르지 않으면 가맹점 계정이 매장에 들어왔을 때 머리의 뱃지에 "재고 부족" 이
 * 뜬다.** 손님으로 온 자리에서 들을 말이 아니고, 무엇보다 누르면 운영 화면으로
 * 튕겨 나간다. 무엇이 어디에 속하는지는 core 가 정한다.
 */
export type NotificationBox = 'customer' | 'console';

const kindsOf = (box: NotificationBox): NotificationKind[] =>
  box === 'console' ? [...CONSOLE_NOTIFICATION_KIND] : [...CUSTOMER_NOTIFICATION_KIND];

export async function getMyNotifications(
  userId: string,
  box: NotificationBox = 'customer',
): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId, kind: { in: kindsOf(box) } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE,
    select: { id: true, kind: true, params: true, linkPath: true, readAt: true, createdAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    params: paramsOf(row.params),
    linkPath: safeLink(row.linkPath),
    unread: row.readAt === null,
    createdAt: row.createdAt,
  }));
}

/** 머리의 뱃지가 쓴다. 세는 것뿐이라 목록을 읽지 않는다. */
export async function countUnread(
  userId: string,
  box: NotificationBox = 'customer',
): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null, kind: { in: kindsOf(box) } } });
}
