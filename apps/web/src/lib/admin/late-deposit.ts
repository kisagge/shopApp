import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor } from '@shop/core';
import { notifyLateDepositRefunded } from '~/lib/notifications/late-deposit';

/**
 * 취소한 주문에 들어온 입금 — 사람이 돌려준 뒤 "처리함" 으로 닫는다.
 *
 * 가상계좌는 입금 뒤에 환불하려면 손님의 환불 계좌가 있어야 해서(PG 규칙) 자동으로 돌려줄 수 없다.
 * 운영진이 손님에게 계좌를 받아 돌려주고, 여기서 닫는다. 닫았다는 사실과 사람을 남긴다 — 돈이
 * 오간 일이라 "누가 언제 처리했는가" 가 나중에 물어볼 첫 질문이다.
 *
 * **환불 권한(order:refund)이 있어야 한다.** 가맹점에게는 없다 — 받은 돈은 플랫폼의 계좌에 있다.
 */
export class LateDepositError extends Error {
  constructor(readonly code: 'ORDER_NOT_FOUND' | 'NO_LATE_DEPOSIT' | 'ALREADY_RESOLVED', message: string, readonly status: number) {
    super(message);
    this.name = 'LateDepositError';
  }
}

export async function resolveLateDeposit(
  actor: Actor,
  orderNo: string,
  now = new Date(),
): Promise<{ orderNo: string; amount: number; resolvedAt: Date }> {
  assertPermission(actor, 'order:refund');

  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: {
      userId: true,
      payment: {
        select: { id: true, lateDepositAt: true, lateDepositAmount: true, lateDepositResolvedAt: true },
      },
    },
  });
  if (!order) throw new LateDepositError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  const payment = order.payment;
  if (!payment?.lateDepositAt) {
    throw new LateDepositError('NO_LATE_DEPOSIT', '이 주문에는 취소 뒤 들어온 입금이 없습니다.', 404);
  }
  if (payment.lateDepositResolvedAt) {
    throw new LateDepositError('ALREADY_RESOLVED', '이미 환불 처리한 입금입니다.', 409);
  }

  // 두 사람이 동시에 눌러도 한 번만 닫힌다
  const { count } = await prisma.payment.updateMany({
    where: { id: payment.id, lateDepositResolvedAt: null },
    data: { lateDepositResolvedAt: now, lateDepositResolvedBy: actor.id },
  });
  if (count === 0) throw new LateDepositError('ALREADY_RESOLVED', '이미 환불 처리한 입금입니다.', 409);

  const amount = payment.lateDepositAmount ?? 0;
  // 돈을 보낸 사람이 끝났다는 것을 듣는다 — 계좌를 알려 준 뒤 기다리고 있다
  await notifyLateDepositRefunded({ orderNo, userId: order.userId, amount });
  return { orderNo, amount, resolvedAt: now };
}
