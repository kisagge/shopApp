import { NextResponse } from 'next/server';
import { authorizeCron } from '~/lib/cron';
import { runEventRollup } from '~/lib/analytics/rollup';
import { pruneOldNotifications } from '~/lib/queries/notifications';
import { recordAudit } from '~/lib/audit';

/**
 * 하루치 정리 배치. 매일 KST 04:00 (UTC 19:00 전날) 에 돈다.
 *
 * **이름은 이벤트 롤업이지만 지우는 일을 함께 한다.** 오래된 알림도 여기서
 * 지운다 — 크론을 하나 더 두지 않는 이유는 배포 플랜마다 개수 제한이 있어서다
 * (docs/DEPLOY.md). 둘 다 "어제까지의 것을 정리한다" 는 같은 일이다.
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

  /*
   * 오래된 알림을 지운다. 보존 기간과 자르는 시각은 진작 core 에 있었는데
   * **부르는 곳이 한 군데도 없어서** 표가 첫날부터 계속 커지기만 했다.
   * 이벤트 원본을 지우는 것과 같은 자리에 둔다.
   */
  const prunedNotifications = await pruneOldNotifications();

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

  if (prunedNotifications > 0) {
    await recordAudit({
      actor: auth.actor,
      action: 'notification.prune',
      targetType: 'notification',
      targetId: 'retention',
      after: { deletedRows: prunedNotifications },
      request,
    });
  }

  return NextResponse.json({ ...result, prunedNotifications });
}
