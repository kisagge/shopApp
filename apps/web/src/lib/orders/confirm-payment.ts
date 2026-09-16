import 'server-only';
import { prisma } from '@shop/db';
import { afterResponse } from '~/lib/api/after-response';
import { deliverOrderNotice, orderLocale, shipToLine } from '~/lib/orders/notify';
import {
  assertPaymentAmount, isPaidStatus, transition, won,
  PaymentError, type PaymentGateway, type Won,
} from '@shop/core';
import { getPaymentGateway } from '~/lib/payments';
import { recordServerEvent } from '~/lib/analytics/server';

export interface ConfirmResult {
  readonly orderNo: string;
  readonly orderStatus: string;
  readonly paymentStatus: string;
  readonly virtualAccount: { bank: string; accountNumber: string; dueDate: string | null } | null;
  /** 이미 처리된 요청을 다시 받았는지 */
  readonly alreadyConfirmed: boolean;
}

export class ConfirmError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) {
    super(message);
    this.name = 'ConfirmError';
  }
}

/**
 * 결제 승인.
 *
 * 세 가지를 지킨다.
 *
 * 1) **금액은 주문에 저장된 값으로 승인한다.** 요청으로 온 금액을 그대로
 *    PG 에 넘기면 1원 결제로 10만원 주문을 통과시킬 수 있다.
 * 2) **두 번 눌러도 한 번만 처리된다.** 같은 주문·같은 paymentKey 로 다시
 *    오면 성공을 그대로 돌려준다. 결제창이 콜백을 두 번 부르는 일은 흔하다.
 * 3) **PG 승인과 DB 반영 사이가 끊기면 안 된다.** 승인은 트랜잭션 밖에서
 *    일어나므로, DB 반영이 실패하면 승인된 돈이 붕 뜬다. 그래서 상태 전이를
 *    조건부 UPDATE 로 걸고, 실패 시 로그로 남겨 수동 대사가 가능하게 한다.
 */
export async function confirmPayment(
  input: { orderNo: string; paymentKey: string; amount: number },
  user: { id: string },
  gateway: PaymentGateway = getPaymentGateway(),
): Promise<ConfirmResult> {
  const order = await prisma.order.findFirst({
    where: { orderNo: input.orderNo, userId: user.id },
    select: {
      id: true, orderNo: true, status: true, payable: true, browserSessionId: true,
      // 안내 메일이 쓴다. 주문에 박아 둔 값을 쓰므로 상품이 바뀌어도 그때 그대로다.
      locale: true, recipient: true, postalCode: true, address1: true, address2: true,
      items: { select: { quantity: true, productName: true, optionLabel: true, unitPrice: true } },
      payment: { select: { id: true, status: true, pgPaymentKey: true } },
      // id 를 함께 읽는다 — 알림함에 남기려면 누구의 것인지 알아야 한다
          user: { select: { id: true, email: true, name: true } },
    },
  });
  if (!order) throw new ConfirmError('ORDER_NOT_FOUND', '주문을 찾을 수 없습니다.', 404);
  if (!order.payment) throw new ConfirmError('PAYMENT_NOT_FOUND', '결제 정보가 없습니다.', 404);

  // ── 멱등: 같은 결제로 이미 처리했으면 그대로 성공을 돌려준다
  if (order.payment.pgPaymentKey === input.paymentKey && order.payment.status !== 'READY') {
    return {
      orderNo: order.orderNo,
      orderStatus: order.status,
      paymentStatus: order.payment.status,
      virtualAccount: null,
      alreadyConfirmed: true,
    };
  }

  if (order.status !== 'PENDING') {
    throw new ConfirmError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');
  }

  // ── 금액은 주문에 저장된 값이 진실이다
  assertPaymentAmount(order.payable as Won, input.amount);

  const result = await gateway.confirm({
    paymentKey: input.paymentKey,
    orderNo: order.orderNo,
    amount: order.payable as Won,
  });

  // 가상계좌는 입금 전이라 주문은 아직 PENDING 이다.
  // 카드·계좌이체는 승인 즉시 PAID 로 넘어간다.
  const paid = isPaidStatus(result.status);
  const nextOrderStatus = paid ? transition(order.status, 'PAID') : order.status;

  try {
    await prisma.$transaction(async (tx) => {
      if (paid) {
        // 조건부 UPDATE. 그 사이 다른 요청이 먼저 처리했으면 0건이 나온다.
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING' },
          data: { status: nextOrderStatus, paidAt: result.approvedAt ?? new Date() },
        });
        if (count === 0) throw new ConfirmError('ALREADY_PROCESSED', '이미 처리된 주문입니다.');

        await tx.orderItem.updateMany({
          where: { orderId: order.id },
          data: { status: nextOrderStatus },
        });
        await tx.orderStatusLog.create({
          data: {
            orderId: order.id, from: 'PENDING', to: nextOrderStatus,
            actor: 'system', note: `결제 승인 (${gateway.provider})`,
          },
        });
      }

      await tx.payment.update({
        where: { id: order.payment!.id },
        data: {
          status: result.status,
          pgProvider: gateway.provider,
          pgPaymentKey: result.paymentKey,
          pgApprovalNo: result.approvalNo,
          approvedAt: result.approvedAt,
          virtualAccount: result.virtualAccount?.accountNumber ?? null,
          virtualBank: result.virtualAccount?.bank ?? null,
          virtualDueDate: result.virtualAccount?.dueDate ?? null,
          rawResponse: result.raw as object,
        },
      });
    });
  } catch (error) {
    // 승인은 났는데 DB 반영이 실패했다. 돈은 이미 빠져나갔으므로 반드시 남긴다.
    console.error('[payment] 승인 후 DB 반영 실패 — 수동 대사 필요', {
      orderNo: order.orderNo, paymentKey: result.paymentKey, amount: result.amount,
    }, error);
    throw error;
  }

  /**
   * 승인 뒤에 붙는 일 — **응답을 막지 않는다.**
   *
   * 매출 기록도 안내 메일도 실패한다고 승인된 결제를 되돌리지 않는다.
   * 그런데 둘 다 `await` 로 응답 앞에 서 있었고, 이 배포는 DB 왕복 하나가
   * 141ms 다. 확정 창구 1.3초 중 승인 뒤 몫이 0.7초였다 — 사용자가 기다릴
   * 이유가 없는 0.7초다.
   *
   * `afterResponse` 는 요청 안에서는 응답 뒤로 미루고, 요청 밖(단위 검사)
   * 에서는 그 자리에서 돌린다. 그래서 아래 일들이 검사에서 사라지지 않는다.
   */
  await afterResponse(async () => {
    /*
     * **한 줄에 꿰지 않는다.** 매출 기록이 던지면 뒤의 안내 메일이 통째로
     * 안 나간다 — 이 둘은 서로 아무 상관이 없는 일이다. 응답 뒤로 미루면서
     * 하나로 묶었다가 그렇게 엮이면, 미룬 것이 새 고장을 만든 셈이 된다.
     */
    if (paid) {
      try {
        // purchase 는 결제가 실제로 성립한 순간에만 기록한다.
        // 주문 생성 시점에 기록하면 결제되지 않은 주문까지 매출로 잡힌다.
        await recordServerEvent({
          name: 'purchase',
          occurredAt: result.approvedAt ?? new Date(),
          // 조회·담기와 **같은 세션**으로 찍어야 퍼널이 이어진다.
          // 주문 세션을 못 받았을 때만 주문번호로 대신한다(그 건은 퍼널에서 빠진다).
          sessionId: order.browserSessionId ?? `order-${order.orderNo}`,
          anonymousId: order.browserSessionId ?? `order-${order.orderNo}`,
          userId: user.id,
          path: '/checkout',
          productId: null, variantId: null,
          orderId: order.orderNo,
          merchantId: null,
          value: order.payable,
          quantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
          props: { provider: gateway.provider, method: result.method },
        });
      } catch (error) {
        console.error('[payment] 매출 기록 실패 — 결제는 성립했다', {
          orderNo: order.orderNo,
        }, error);
      }
    }

    /*
     * 안내 메일.
     *
     * **결제가 성립한 뒤에 보낸다.** 주문을 만들 때 보내면 결제 화면에서
     * 떠난 사람에게도 "주문이 완료되었습니다" 가 간다 — 실제로 그런 주문이
     * 재고를 물고 있었던 것을 앞서 봤다.
     *
     * 가상계좌는 아직 입금 전이라 다른 말을 보낸다. 이때 계좌번호를 메일로
     * 주지 않으면 **화면을 닫는 순간 어디로 넣을지 알 길이 없어진다.**
     *
     * 던지지 않는다. 여기서 실패한다고 승인된 결제를 되돌릴 수는 없다.
     */
    await deliverOrderNotice(paid ? 'paid' : 'pending', {
      userId: order.user.id,
      to: order.user.email,
      buyerName: order.user.name,
      orderNo: order.orderNo,
      locale: orderLocale(order.locale),
      items: order.items,
      payable: order.payable,
      shipTo: shipToLine(order),
      ...(result.virtualAccount
        ? {
            virtualAccount: {
              bank: result.virtualAccount.bank,
              accountNumber: result.virtualAccount.accountNumber,
              dueDate: result.virtualAccount.dueDate ?? null,
            },
          }
        : {}),
    });
  });

  return {
    orderNo: order.orderNo,
    orderStatus: nextOrderStatus,
    paymentStatus: result.status,
    virtualAccount: result.virtualAccount
      ? {
          bank: result.virtualAccount.bank,
          accountNumber: result.virtualAccount.accountNumber,
          dueDate: result.virtualAccount.dueDate?.toISOString() ?? null,
        }
      : null,
    alreadyConfirmed: false,
  };
}

export { PaymentError, won };
