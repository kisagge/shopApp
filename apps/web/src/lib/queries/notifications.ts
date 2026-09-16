import 'server-only';
import { prisma } from '@shop/db';
import {
  CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND, offsetOf, notificationCutoff,
  type NotificationKind,
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

export const NOTIFICATION_PAGE_SIZE = 30;

/**
 * 한 쪽과 전체 수.
 *
 * **서른한 번째 알림은 볼 길이 없었다.** 서른 개를 잘라 오고 그게 끝이라, 그
 * 아래는 주소로도 못 갔다 — 알림은 지워지지도 않으니 조용히 쌓이기만 했다.
 * 정렬에 id 가 딸려 있던 것은 언젠가 넘길 생각이었다는 흔적이다.
 */
export interface NotificationPage {
  readonly rows: readonly NotificationView[];
  readonly total: number;
}

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
  page = 1,
): Promise<NotificationPage> {
  const where = { userId, kind: { in: kindsOf(box) } };

  /*
   * 쪽 번호로 넘긴다(운영 목록과 같은 셈법 — core 의 pagination).
   *
   * 커서 대신 번호를 쓰는 값은 여기서도 같다: 보는 사이에 새 알림이 오면 한 줄이
   * 밀려 겹쳐 보일 수 있다. 알림은 **읽고 지나가는 자리**라 그 편이 낫고,
   * 무엇보다 지금은 서른 개 뒤로 갈 길이 아예 없다.
   */
  const read = (at: number) =>
    prisma.notification.findMany({
      where,
      // 같은 순간에 온 것들(한 번에 여러 건을 적는 재고 부족 알림)이 쪽마다 흔들리지 않게 id 로 마저 가른다
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NOTIFICATION_PAGE_SIZE,
      skip: offsetOf(at, NOTIFICATION_PAGE_SIZE),
      select: { id: true, kind: true, params: true, linkPath: true, readAt: true, createdAt: true },
    });

  const [first, total] = await Promise.all([read(page), prisma.notification.count({ where })]);

  /*
   * **범위를 넘었으면 마지막 쪽을 보여 준다.**
   *
   * 주소는 손으로 고칠 수 있고, 즐겨찾기에 담아 둔 쪽은 알림이 지워지면서 사라진다.
   * 그때 빈 화면을 주면 "왜 아무것도 없지" 로 끝난다 — 쪽 번호는 마지막 쪽을 가리켜
   * 그리는데 목록만 비어 있으니 더 그렇다(core 의 clampPage 가 적어 둔 뜻이다).
   *
   * 넘쳤을 때만 한 번 더 읽는다. 세고 나서 읽으면 멀쩡한 쪽까지 왕복이 하나 늘어난다.
   */
  const lastPage = Math.max(Math.ceil(total / NOTIFICATION_PAGE_SIZE), 1);
  const rows = first.length === 0 && total > 0 && page > lastPage ? await read(lastPage) : first;

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      params: paramsOf(row.params),
      linkPath: safeLink(row.linkPath),
      unread: row.readAt === null,
      createdAt: row.createdAt,
    })),
  };
}

/** 머리의 뱃지가 쓴다. 세는 것뿐이라 목록을 읽지 않는다. */
export async function countUnread(
  userId: string,
  box: NotificationBox = 'customer',
): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null, kind: { in: kindsOf(box) } } });
}

/**
 * 오래된 알림을 지운다.
 *
 * **정책은 진작 적혀 있었는데 아무도 지우지 않았다.** core 에 보존 기간(90일)과
 * 자르는 시각(notificationCutoff)이 있고 주석에는 "배치가 지운다" 고 되어 있었지만,
 * 부르는 곳이 **한 군데도 없었다** — 표는 첫날부터 계속 커지기만 했다.
 *
 * **읽은 것만 지운다.** 안 읽은 것은 오래됐어도 그 사람이 아직 못 본 소식이다.
 * 90일 넘게 안 읽었다면 볼 일이 없을 가능성이 크지만, 그 판단을 우리가 대신
 * 내리면 "왜 알림이 사라졌냐" 는 말에 답할 수가 없다.
 *
 * 여러 번 돌아도 결과가 같다 — 이미 지운 것을 또 지울 뿐이다.
 */
export async function pruneOldNotifications(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { createdAt: { lt: notificationCutoff(now) }, readAt: { not: null } },
  });
  return count;
}
