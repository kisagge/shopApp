import 'server-only';
import { prisma } from '@shop/db';
import { isPaidStatus, transition, type PaymentGateway } from '@shop/core';
import { getPaymentGateway } from './index';
import { recordServerEvent } from '~/lib/analytics/server';

/**
 * 가상계좌 입금 반영.
 *
 * 가상계좌는 결제창을 닫는 순간 끝나지 않는다. 계좌번호만 받고 나가서
 * 며칠 뒤에 입금할 수도 있다. 그 입금을 알려 주는 것이 웹훅이고,
 * **웹훅이 오기 전까지 주문은 결제 대기다.**
 */

export type DepositOutcome =
  | { readonly applied: true; readonly orderNo: string; readonly status: string }
  | { readonly applied: false; readonly reason: string };

/**
 * paymentKey 하나를 PG 에 다시 물어보고 그 결과로 주문을 갱신한다.
 *
 * **웹훅 본문은 쓰지 않는다.** 엔드포인트 주소만 알면 누구나 "입금됐다" 고
 * 보낼 수 있고, 본문을 믿으면 돈을 받지 않고 주문이 결제 완료가 된다.
 * 웹훅은 "가서 확인해라" 는 신호일 뿐이고 진실은 PG 에 물어서 가져온다.
 *
 * 그래서 이 함수는 웹훅이 아니라 **paymentKey 만** 받는다. 상태·금액을
 * 인자로 받게 두면 언젠가 누가 웹훅 본문을 그대로 넘기게 된다.
 */
export async function applyDeposit(
  paymentKey: string,
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<DepositOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { pgPaymentKey: paymentKey },
    select: {
      id: true,
      status: true,
      amount: true,
      order: { select: { id: true, orderNo: true, status: true, userId: true, browserSessionId: true } },
    },
  });
  if (!payment) return { applied: false, reason: '우리 결제가 아닙니다' };

  // 이미 반영했으면 아무 일도 하지 않는다. 웹훅은 여러 번 온다.
  if (payment.status === 'DONE') {
    return { applied: false, reason: '이미 반영된 입금입니다' };
  }

  const result = await gateway.inquire(paymentKey);

  if (!isPaidStatus(result.status)) {
    return { applied: false, reason: `아직 입금 전입니다 (${result.status})` };
  }

  /**
   * 금액이 다르면 반영하지 않는다.
   *
   * 가상계좌는 사용자가 직접 송금하므로 **금액을 틀리게 보낼 수 있다.**
   * 덜 보냈는데 결제 완료로 넘기면 그만큼 손해다. 사람이 확인해야 하는
   * 상황이므로 남기고 멈춘다.
   */
  if (result.amount !== payment.amount) {
    console.error('[deposit] 입금액이 주문 금액과 다릅니다', {
      orderNo: payment.order.orderNo,
      expected: payment.amount,
      received: result.amount,
    });
    return { applied: false, reason: '입금액이 주문 금액과 다릅니다' };
  }

  const nextStatus = transition(payment.order.status, 'PAID');

  await prisma.$transaction(async (tx) => {
    // 조건부 UPDATE. 그 사이 다른 웹훅이 먼저 처리했으면 0건이 나온다.
    const { count } = await tx.order.updateMany({
      where: { id: payment.order.id, status: 'PENDING' },
      data: { status: nextStatus, paidAt: result.approvedAt ?? new Date() },
    });
    if (count === 0) return;

    await tx.orderItem.updateMany({
      where: { orderId: payment.order.id },
      data: { status: nextStatus },
    });
    await tx.orderStatusLog.create({
      data: {
        orderId: payment.order.id,
        from: 'PENDING',
        to: nextStatus,
        actor: 'system',
        note: '가상계좌 입금 확인',
      },
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'DONE',
        approvedAt: result.approvedAt ?? new Date(),
        rawResponse: result.raw as object,
      },
    });
  });

  // 매출 이벤트는 서버에서만 기록한다. 브라우저가 보낸 것은 수집 API 가 버린다.
  const session = payment.order.browserSessionId ?? `order-${payment.order.orderNo}`;
  await recordServerEvent({
    name: 'purchase',
    occurredAt: result.approvedAt ?? new Date(),
    // 조회·담기와 같은 세션으로 찍어야 퍼널이 이어진다
    sessionId: session,
    anonymousId: session,
    userId: payment.order.userId,
    path: '/checkout',
    productId: null, variantId: null,
    orderId: payment.order.orderNo,
    merchantId: null,
    value: payment.amount,
    quantity: null,
    props: { provider: gateway.provider, method: 'VIRTUAL_ACCOUNT', via: 'deposit_webhook' },
  });

  return { applied: true, orderNo: payment.order.orderNo, status: nextStatus };
}
