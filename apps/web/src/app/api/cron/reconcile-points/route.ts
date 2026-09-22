import { cronRoute } from '~/lib/cron';
import { reconcilePoints } from '~/lib/admin/reconcile-points';

/**
 * 포인트 잔액 대사 배치. 매일 KST 03:00 (UTC 18:00 전날).
 *
 * 원장 → 잔액 방향으로만 고친다.
 */
export const GET = cronRoute('points.reconcile', async (actor) => {
  const result = await reconcilePoints(actor, { fix: true });

  if (result.fixed > 0) {
    console.warn('[cron] 포인트 잔액 불일치를 원장에 맞췄습니다', {
      fixed: result.fixed,
      overCredited: result.overCredited,
    });
  }

  return {
    body: {
      checked: result.checked,
      mismatches: result.mismatchTotal,
      fixed: result.fixed,
      overCredited: result.overCredited,
    },
    audits: result.fixed > 0
      ? [{
          action: 'points.reconcile',
          targetType: 'user' as const,
          targetId: `${result.fixed}건`,
          after: {
            fixed: result.fixed,
            overCredited: result.overCredited,
            users: result.fixes,
          },
        }]
      : [],
  };
});
