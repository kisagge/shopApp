import 'server-only';
import { LEDGER_ROUTE_TYPE } from '@shop/core';
import { reportError } from './index';

/**
 * **돈은 움직였는데 장부가 어긋났다.**
 *
 * PG 왕복은 성공했는데 그 뒤 DB 반영이 실패하는 자리가 다섯 있다 — 승인·취소·부분취소·반품·환불.
 * 그때 손님 카드에서는 돈이 빠졌거나 나갔는데 우리 기록에는 없다.
 *
 * **예전에는 `console.error` 한 줄이 전부였다.** 주석은 스스로 "수동 대사 필요" 라고 적어 두었는데
 * 그 대사를 할 사람에게 닿는 길이 없었다 — 손님은 문의를 넣고, 운영자는 Vercel 로그를 뒤져야 했다.
 * 포인트에는 대사 배치와 화면이 있는데(reconcile-points) 정작 결제·환불에는 없다.
 *
 * 그래서 **오류 수집으로 보낸다.** 운영 화면(`/admin/errors`)에 뜨고, 같은 자리에서 한 시간에 한 번
 * 메일로도 알린다. 심각도는 `fatal` 이다 — 화면이 깨진 것과 같은 급으로 본다.
 *
 * **던지지 않는다.** 부르는 자리는 이미 원래 오류를 던지는 중이고, 보고하다 또 던지면 그 오류가 묻힌다.
 */
export async function reportLedgerMismatch(input: {
  /** 어느 걸음에서 어긋났는가. 같은 걸음끼리 묶인다 */
  readonly stage: 'payment.confirm' | 'order.cancel' | 'order.cancelItems' | 'return.complete' | 'order.refund';
  readonly orderNo: string;
  /** 대사에 필요한 것 — 멱등 키·금액처럼 "다시 눌러도 되는가" 를 판단할 값 */
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly error: unknown;
}): Promise<void> {
  const cause = input.error instanceof Error ? input.error.message : String(input.error);
  const error = new Error(
    `돈은 움직였는데 장부가 어긋났다 — ${input.stage} (주문 ${input.orderNo}): ${cause}`,
    { cause: input.error },
  );
  error.name = 'LedgerMismatchError';
  // 원래 오류의 스택을 잃지 않는다 — 어느 줄에서 넘어졌는지가 대사의 출발점이다
  if (input.error instanceof Error && input.error.stack) error.stack = input.error.stack;

  await reportError({
    error,
    // 운영자가 곧바로 열어 볼 자리
    path: `/admin/orders/${input.orderNo}`,
    method: 'LEDGER',
    headers: {},
    // 걸음마다 한 묶음이 된다 — 주문번호는 지문이 자리표시로 바꾼다
    routePath: `ledger:${input.stage}`,
    routeType: LEDGER_ROUTE_TYPE,
  });

  /*
   * 로그에도 그대로 남긴다. 대사에 필요한 값(멱등 키·금액)은 오류 보고의 모양에 넣을 자리가 없고,
   * 이 줄을 읽는 사람은 "다시 눌러도 되는가" 를 그 값으로 판단한다.
   */
  console.error(`[${input.stage}] 장부 어긋남 — 수동 대사 필요`, {
    orderNo: input.orderNo,
    ...input.detail,
  }, input.error);
}
