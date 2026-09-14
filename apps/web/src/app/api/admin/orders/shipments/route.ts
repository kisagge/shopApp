import { NextResponse } from 'next/server';
import {
  hasPermission, parseCsv, readShipmentUpload, SHIPMENT_UPLOAD_MAX_ORDERS,
  type ShipmentUploadProblem,
} from '@shop/core';
import { bulkShipmentSchema, type BulkShipmentResult } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { findUnchangedShipments, registerShipmentAudited, ShipmentError } from '~/lib/admin/manage-shipment';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 송장 일괄 올리기.
 *
 * **한 건 등록과 같은 함수를 줄마다 부른다**(registerShipmentAudited). 일괄이라고
 * 규칙을 따로 두면 반드시 갈린다 — 가맹점 범위, 취소된 주문에 송장이 안 붙는 것,
 * 송장번호 모양 검사, 감사 로그. 한 건에서 막히는 것은 여기서도 막혀야 한다.
 *
 * **하나가 실패해도 나머지는 적용한다.** 500줄 중 한 줄의 오타 때문에 499건의
 * 발송 등록을 막으면, 운영자는 틀린 한 줄을 찾느라 손님들의 배송 조회를 하루 늦춘다.
 * 대신 무엇이 왜 안 됐는지 줄 번호와 함께 돌려준다.
 */

const PROBLEM_MESSAGE: Record<ShipmentUploadProblem['kind'], string> = {
  NO_HEADER: '머리칸이 없습니다',
  CONFLICT: '같은 주문에 송장번호가 둘 이상 적혀 있습니다. 한 줄만 남겨 주세요.',
  MISSING_CARRIER: '택배사가 비어 있습니다.',
  UNKNOWN_CARRIER: '모르는 택배사입니다.',
};

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = bulkShipmentSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const upload = readShipmentUpload(parseCsv(parsed.data.csv));

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

  const failures: BulkShipmentResult['failures'][number][] = upload.problems.map((p) => ({
    orderNo: 'orderNo' in p ? p.orderNo : null,
    lines: 'lines' in p ? p.lines : 'line' in p ? [p.line] : [],
    code: p.kind,
    message:
      p.kind === 'UNKNOWN_CARRIER'
        ? `${PROBLEM_MESSAGE[p.kind]} (${p.carrier})`
        : PROBLEM_MESSAGE[p.kind],
  }));

  let registered = 0;
  const unchanged = await findUnchangedShipments(upload.entries, actor);

  /*
   * **하나씩 차례로 한다.** 동시에 던지면 빠르지만, 같은 주문이 섞였을 때(위에서 묶지만
   * 대소문자·공백이 다른 번호) 두 요청이 같은 줄을 동시에 고쳐 누가 이길지 모른다.
   * 수백 건이면 몇 초이고, 이건 사람이 기다리는 창구가 아니다.
   */
  for (const entry of upload.entries) {
    if (unchanged.has(entry.orderNo)) continue;
    try {
      await registerShipmentAudited(
        entry.orderNo,
        { carrier: entry.carrier, trackingNumber: entry.trackingNumber },
        actor,
        request,
      );
      registered += 1;
    } catch (error) {
      if (error instanceof ShipmentError) {
        failures.push({
          orderNo: entry.orderNo,
          lines: [entry.line],
          code: error.code,
          message: error.message,
        });
        continue;
      }
      throw error;
    }
  }

  const result: BulkShipmentResult = { registered, skipped: upload.skipped, unchanged: unchanged.size, failures };
  return NextResponse.json(result);
}
