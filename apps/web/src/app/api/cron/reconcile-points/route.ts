import { NextResponse } from 'next/server';
import { authorizeCron } from '~/lib/cron';
import { reconcilePoints } from '~/lib/admin/reconcile-points';
import { recordAudit } from '~/lib/audit';

/**
 * 포인트 잔액 대사 배치. 매일 KST 03:00 (UTC 18:00 전날).
 *
 * 원장 → 잔액 방향으로만 고친다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
  }

  const result = await reconcilePoints(auth.actor, { fix: true });

  if (result.fixed > 0) {
    console.warn('[cron] 포인트 잔액 불일치를 원장에 맞췄습니다', {
      fixed: result.fixed,
      overCredited: result.overCredited,
    });
    await recordAudit({
      actor: auth.actor,
      action: 'points.reconcile',
      targetType: 'user',
      targetId: `${result.fixed}건`,
      after: {
        fixed: result.fixed,
        overCredited: result.overCredited,
        users: result.fixes,
      },
      request,
    });
  }

  return NextResponse.json({
    checked: result.checked,
    mismatches: result.mismatchTotal,
    fixed: result.fixed,
    overCredited: result.overCredited,
  });
}
