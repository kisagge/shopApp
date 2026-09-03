import { NextResponse } from 'next/server';
import { authorizeCron } from '~/lib/cron';
import { autoConfirmDelivered } from '~/lib/orders/auto-confirm';
import { recordAudit } from '~/lib/audit';

/**
 * 자동 구매확정 배치. 매일 KST 05:00 (UTC 20:00 전날) 에 돈다.
 *
 * 배송완료 후 정해진 날이 지난 주문을 확정하고 적립을 지급한다.
 * 이것이 없으면 적립은 영원히 나가지 않는다 — 대부분의 사람은 확정
 * 버튼을 누르지 않기 때문이다.
 *
 * 여러 번 돌아도 안전하다. 확정은 조건부 UPDATE 로 걸려 있고 적립은
 * 같은 주문에 두 번 들어가지 않는다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
  }

  const result = await autoConfirmDelivered();

  // 포인트가 나간 날만 남긴다. 0건인 날까지 남기면 봐야 할 줄이 묻힌다.
  if (result.confirmed > 0) {
    await recordAudit({
      actor: auth.actor,
      action: 'order.autoConfirm',
      targetType: 'order',
      targetId: `${result.confirmed}건`,
      after: { confirmed: result.confirmed, rewarded: result.rewarded },
      request,
    });
  }

  return NextResponse.json(result);
}
