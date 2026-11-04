import { NextResponse } from 'next/server';
import {
  hasPermission, parseCsv, readDeliveryUpload, SHIPMENT_UPLOAD_MAX_ORDERS,
} from '@shop/core';
import { bulkDeliverySchema, type BulkDeliveryResult } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { transitionOrder, TransitionError } from '~/lib/admin/transition-order';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, localizedMessage, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 배송완료 일괄 처리.
 *
 * **송장은 한 번에 올리는데 도착 처리는 주문마다 눌러야 했다.** 500건을 올려 놓고 500번을 누르는 셈이라
 * 주문이 조금만 늘어도 실제로는 안 눌린다. 그런데 **배송완료일부터 시계가 돈다** — 반품·교환 기한도,
 * 자동 구매확정도, 후기를 쓸 수 있는 때도. 안 눌리면 손님은 반품 신청조차 못 하고, 적립금은 묶인 채
 * 남고, 그 매출은 정산에 안 잡힌다.
 *
 * **한 건 상태 변경과 같은 함수를 줄마다 부른다**(transitionOrder). 일괄이라고 규칙을 따로 두면 반드시
 * 갈린다 — 가맹점 범위, 상태 전이 규칙, 가맹점 상품이 섞인 주문의 대기, 손님 알림·메일, 기록. 한 건에서
 * 막히는 것은 여기서도 막혀야 한다.
 *
 * **하나가 실패해도 나머지는 옮긴다.** 500줄 중 하나가 이미 취소된 주문이라고 499건의 도착 처리를 막으면,
 * 운영자는 그 한 줄을 찾느라 손님들의 반품 기한을 하루 늦춘다. 대신 무엇이 왜 안 됐는지 줄 번호와 함께 준다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다 — 순서가 반대면 무엇을 보내야 통과하는지 알려 주게 된다
  if (!hasPermission(actor, 'order:fulfill')) {
    return await forbidden();
  }

  const limited = await enforceRateLimit('shipmentBulk', request, actor.id);
  if (limited) return limited;

  const parsed = await readBody(request, bulkDeliverySchema);
  if (!parsed.ok) return parsed.response;

  const upload = readDeliveryUpload(parseCsv(parsed.data.csv));

  const header = upload.problems.find((p) => p.kind === 'NO_HEADER');
  if (header && header.kind === 'NO_HEADER') {
    return NextResponse.json(
      {
        code: 'NO_HEADER',
        message: `필요한 머리칸이 없습니다: ${header.missing.join(', ')}. 주문 내려받기 파일을 그대로 쓰면 됩니다.`,
      },
      { status: 400 },
    );
  }

  if (upload.entries.length > SHIPMENT_UPLOAD_MAX_ORDERS) {
    return NextResponse.json(
      {
        code: 'TOO_MANY',
        message: `한 번에 ${SHIPMENT_UPLOAD_MAX_ORDERS.toLocaleString('ko-KR')}건까지 올릴 수 있습니다. 나눠 올려 주세요.`,
      },
      { status: 413 },
    );
  }

  /*
   * **주문번호가 빈 줄도 실패로 적는다.** 옮길 주문이 없으니 아래 루프가 할 일은 없는데,
   * 아무 말도 안 하면 그 줄은 조용히 사라진다 — 운영자는 올렸다고 여기고 그 주문의
   * 반품 기한 시계는 멈춘 채로 있다. 이 창구의 약속이 "무엇이 왜 안 됐는지 줄 번호와
   * 함께 준다" 이므로 그 약속을 파일 쪽 실패에도 적용한다.
   */
  const failures: BulkDeliveryResult['failures'][number][] = upload.problems.flatMap((p) =>
    p.kind === 'NO_ORDER_NO'
      ? [{
          orderNo: null,
          lines: [p.line],
          code: p.kind,
          message: '주문번호가 비어 있습니다. 어느 주문인지 알 수 없어 옮기지 않았습니다.',
        }]
      : [],
  );
  const moved: string[] = [];

  /*
   * **하나씩 차례로 한다.** 동시에 던지면 빠르지만, 같은 주문이 섞였을 때 두 요청이 같은 줄을 고쳐
   * 누가 이길지 모른다. 수백 건이면 몇 초이고, 이건 사람이 기다리는 창구가 아니다.
   */
  for (const entry of upload.entries) {
    try {
      await transitionOrder(entry.orderNo, 'DELIVERED', actor, '배송완료 일괄 처리');
      moved.push(entry.orderNo);
    } catch (error) {
      if (error instanceof TransitionError) {
        failures.push({
          orderNo: entry.orderNo,
          lines: [entry.line],
          code: error.code,
          message: await localizedMessage(error),
        });
        continue;
      }
      throw error;
    }
  }

  /*
   * 감사 로그는 **한 번만** 남긴다. 500건이면 500줄이 쌓여 그날의 다른 기록이 통째로 묻힌다 —
   * 어느 주문이 옮겨졌는지는 주문마다 남는 상태 기록(OrderStatusLog)이 갖고 있다.
   */
  if (moved.length > 0) {
    await recordAudit({
      actor,
      action: 'order.status.delivered.bulk',
      targetType: 'order',
      targetId: `${moved.length}건`,
      after: { delivered: moved.length, orderNos: moved.slice(0, 50) },
      request,
    });
  }

  const result: BulkDeliveryResult = { delivered: moved.length, merged: upload.merged, failures };
  return NextResponse.json(result);
}
