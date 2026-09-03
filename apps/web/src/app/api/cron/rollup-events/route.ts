import { NextResponse } from 'next/server';
import { authorizeCron } from '~/lib/cron';
import { runEventRollup } from '~/lib/analytics/rollup';
import { recordAudit } from '~/lib/audit';

/**
 * 이벤트 롤업 배치. 매일 KST 04:00 (UTC 19:00 전날) 에 돈다.
 *
 * 새벽에 도는 이유는 접는 대상이 **어제**이기 때문이다. 자정 직후에 돌면
 * 늦게 도착한 이벤트(브라우저가 이탈 직전 sendBeacon 으로 보낸 것)가
 * 아직 안 들어와 있을 수 있다. 몇 시간 여유를 둔다.
 *
 * 여러 번 돌아도 결과가 같다 — 접는 것은 원본을 다시 세서 덮어쓰고,
 * 지우는 것은 이미 지운 것을 또 지울 뿐이다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
  }

  const result = await runEventRollup();

  // 원본을 지웠으면 남긴다. 되돌릴 수 없는 동작이라 언제 얼마나 지웠는지는
  // 남아 있어야 한다. 아무것도 안 지운 날까지 남기면 감사 로그가 잡음으로 찬다.
  if (result.deletedRows > 0) {
    await recordAudit({
      actor: auth.actor,
      action: 'event.prune',
      targetType: 'event_log',
      targetId: result.deletedThrough ?? 'unknown',
      after: { deletedRows: result.deletedRows, through: result.deletedThrough },
      request,
    });
  }

  return NextResponse.json(result);
}
