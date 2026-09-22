import { cronRoute } from '~/lib/cron';
import { expirePoints } from '~/lib/points/expire';

/**
 * 포인트 소멸 배치. 매일 KST 02:00 (UTC 17:00 전날) 에 돈다.
 *
 * **대사보다 먼저 돈다.** 소멸이 잔액과 원장을 함께 바꾸므로, 대사가 먼저
 * 돌면 곧 소멸시킬 값을 정상으로 보고 지나간다. 순서가 반대여도 틀리지는
 * 않지만 같은 날 두 배치가 보는 값이 어긋난다.
 *
 * 여러 번 돌아도 안전하다 — 소멸 기록이 다음 계산에서 차감으로 들어간다.
 */
export const GET = cronRoute('points.expire', async () => {
  const result = await expirePoints();

  return {
    body: result,
    // 돈이 사라진 날만 남긴다. 0건인 날까지 남기면 봐야 할 줄이 묻힌다.
    audits: result.total > 0
      ? [{
          action: 'points.expire',
          targetType: 'user' as const,
          targetId: `${result.expired.length}명`,
          after: { total: result.total, users: result.expired.length },
        }]
      : [],
  };
});
