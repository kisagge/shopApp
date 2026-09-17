import 'server-only';
import { prisma } from '@shop/db';
import { operatorRolesWith } from '@shop/core';
import { recordNotifications, type NoticeInput } from './record';

/**
 * 취소한 주문에 들어온 입금을 알린다 — 돈을 보낸 손님에게, 그리고 돌려줄 수 있는 운영진에게.
 *
 * **받은 돈을 적어 두고 운영 대시보드에만 띄웠다.** 손님은 돈이 빠져나갔는데 주문은 취소된 채라 무슨 일인지 몰랐고,
 * 가상계좌 입금을 돌려받으려면 계좌를 알려야 한다는 것(PG 규칙)도 몰랐다. 운영진은 대시보드를 열어야 알았다.
 *
 * 금액을 싣는다 — 정산 알림과 같은 쉼표 모양이다. **실패해도 던지지 않는다**(record 와 같은 규칙) — 입금은 이미 적혔고,
 * 웹훅이 실패로 끝나면 결제사가 다시 보낸다.
 */

const amountText = (won: number): string => won.toLocaleString('en-US');

/** 돌려줄 입금이 새로 생겼다. 같은 입금에 두 번 부르지 않는다 — 부르는 쪽이 처음 적은 때만 부른다 */
export async function notifyLateDepositFound(input: { orderNo: string; userId: string; amount: number }): Promise<void> {
  try {
    const staff = await prisma.user.findMany({
      where: { suspendedAt: null, role: { in: operatorRolesWith('order:refund') } },
      select: { id: true },
    });
    const orderNo = input.orderNo;
    const amount = amountText(input.amount);
    await recordNotifications([
      {
        userId: input.userId,
        kind: 'LATE_DEPOSIT_RECEIVED',
        params: { orderNo: orderNo, amount: amount },
        // 주문 화면이 계좌를 알려 줄 길(1:1 문의)을 함께 보여 준다
        linkPath: `/order/${encodeURIComponent(orderNo)}`,
      },
      ...staff.map((person): NoticeInput => ({
        userId: person.id,
        kind: 'LATE_DEPOSIT_FOUND',
        params: { orderNo: orderNo, amount: amount },
        // 맨 위에 "환불 처리함" 이 서는 자리다
        linkPath: `/admin/orders/${encodeURIComponent(orderNo)}`,
      })),
    ]);
  } catch (error) {
    console.error('[notification] 취소 뒤 입금 알림을 못 만들었다', { orderNo: input.orderNo }, error);
  }
}

/** 돌려주었다 — 손님에게 */
export async function notifyLateDepositRefunded(input: { orderNo: string; userId: string; amount: number }): Promise<void> {
  await recordNotifications([{
    userId: input.userId,
    kind: 'LATE_DEPOSIT_REFUNDED',
    params: { orderNo: input.orderNo, amount: amountText(input.amount) },
    linkPath: `/order/${encodeURIComponent(input.orderNo)}`,
  }]);
}
