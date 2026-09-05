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
