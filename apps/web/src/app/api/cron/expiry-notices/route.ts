import { NextResponse } from 'next/server';
import { authorizeCron } from '~/lib/cron';
import { sendExpiryNotices } from '~/lib/notifications/expiry-notice';
import { recordAudit } from '~/lib/audit';

/**
 * 곧 사라질 쿠폰·적립금 알림. 매일 KST 10:00 (UTC 01:00) 에 돈다 — 새벽에 오는 알림은 읽히지 않고, 소멸 배치(04:00)가
 * 먼저 돌아 이미 사라진 것을 알리지 않는다.
 *
 * 여러 번 돌아도 안전하다 — 알린 쿠폰·적립에 표시가 남아 다음 실행이 건너뛴다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
  }

  const result = await sendExpiryNotices();

  // 알린 날만 남긴다. 0건인 날까지 남기면 봐야 할 줄이 묻힌다
  if (result.couponUsers + result.pointUsers > 0) {
    await recordAudit({
      actor: auth.actor,
      action: 'notices.expiry',
      targetType: 'user',
      targetId: `${result.couponUsers + result.pointUsers}명`,
      after: result,
      request,
    });
  }

  return NextResponse.json(result);
}
