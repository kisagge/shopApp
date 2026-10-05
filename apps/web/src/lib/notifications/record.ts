import 'server-only';
import { prisma } from '@shop/db';
import type { NotificationKind } from '@shop/core';

/**
 * 알림 남기기.
 *
 * **실패해도 던지지 않는다.** 부르는 자리에서는 이미 본 일이 끝나 있다 —
 * 주문이 출고됐고, 답변이 저장됐다. 알림을 못 남겼다고 그것을 무를 수는
 * 없고, 무르는 편이 더 나쁘다. 메일 알림과 같은 규칙이다.
 *
 * **문구를 만들지 않는다.** 무슨 일이 있었는지와 끼울 값만 남긴다 —
 * 사용자가 나중에 다른 말로 읽을 수 있어야 한다.
 */

export interface NoticeInput {
  readonly userId: string;
  readonly kind: NotificationKind;
  /** 문구에 끼울 값. 상품 이름, 주문번호 같은 것. */
  readonly params?: Record<string, string>;
  /** 눌렀을 때 갈 곳. 우리 경로만. */
  readonly linkPath?: string;
}

export async function recordNotification(input: NoticeInput): Promise<void> {
  await recordNotifications([input]);
}

export async function recordNotifications(inputs: readonly NoticeInput[]): Promise<void> {
  if (inputs.length === 0) return;

  try {
    await prisma.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        kind: n.kind,
        params: n.params ?? {},
        linkPath: n.linkPath ?? null,
      })),
    });
  } catch (error) {
    // 조용히 넘기지는 않는다. 알림이 안 뜨는 것은 알아채기 어려운 종류다.
    console.error('[notification] 남기지 못했습니다', inputs.length, error);
  }
}

/**
 * **그 일이 끝났으니 알림도 읽힌다.**
 *
 * 운영 알림함은 쌓이는 만큼 비워지지 않았다 — 주소가 바뀌었다는 알림은 그 주문을 보낸 뒤에도,
 * 반품지가 없다는 알림은 등록한 뒤에도 안 읽음으로 남았다. 그러면 뱃지의 숫자가 "할 일이 몇 개"
 * 가 아니라 "그동안 몇 번 일이 있었나" 가 되고, 그 숫자를 아무도 보지 않게 된다.
 *
 * **지우지 않고 읽음으로 남긴다.** 무슨 일이 있었는지는 기록으로 남아야 하고(처리 이력·감사 로그와
 * 같은 결이다), 알림함을 거슬러 올라가 "그때 이런 알림이 왔었다" 를 볼 수 있어야 한다.
 *
 * 좁히는 방법은 둘이다 — **무엇에 대한 알림인가**(params 의 한 칸, 주문번호 같은 것)와 **누구의
 * 알림함인가**(반품지처럼 받는 사람이 곧 대상인 경우). 둘 다 없으면 종류 전체를 읽음으로 만들게
 * 되므로 받지 않는다.
 *
 * **실패해도 던지지 않는다**(record 와 같은 규칙) — 본 일은 이미 끝났다.
 */
export async function markNoticesDone(input: {
  readonly kinds: readonly NotificationKind[];
  /** params 의 한 칸으로 고른다. 예: 주문번호 */
  readonly about?: { readonly key: string; readonly value: string };
  /** 받는 사람으로 고른다. 그 사람 앞으로 온 그 종류가 전부 그 일에 대한 것일 때만 */
  readonly userIds?: readonly string[];
}): Promise<void> {
  if (input.kinds.length === 0) return;
  if (input.about === undefined && input.userIds === undefined) return;
  if (input.userIds !== undefined && input.userIds.length === 0) return;

  try {
    await prisma.notification.updateMany({
      where: {
        kind: { in: [...input.kinds] },
        // 이미 읽은 것은 건드리지 않는다 — 읽은 시각이 뒤로 밀리면 안 된다
        readAt: null,
        ...(input.about ? { params: { path: [input.about.key], equals: input.about.value } } : {}),
        ...(input.userIds ? { userId: { in: [...input.userIds] } } : {}),
      },
      data: { readAt: new Date() },
    });
  } catch (error) {
    console.error('[notification] 끝난 일을 읽음으로 남기지 못했습니다', input.kinds, error);
  }
}
