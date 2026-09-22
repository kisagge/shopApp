import { cronRoute } from '~/lib/cron';
import { sendExpiryNotices } from '~/lib/notifications/expiry-notice';

/**
 * 곧 사라질 쿠폰·적립금 알림. 매일 KST 10:00 (UTC 01:00) 에 돈다 — 새벽에 오는 알림은 읽히지 않고, 소멸 배치가
 * 먼저 돌아 이미 사라진 것을 알리지 않는다(시각은 옮겨 적지 않는다 — 옮겨 적은 값은 원본이 움직여도 안 따라온다).
 *
 * 여러 번 돌아도 안전하다 — 알린 쿠폰·적립에 표시가 남아 다음 실행이 건너뛴다.
 */
export const GET = cronRoute('notices.expiry', async () => {
  const result = await sendExpiryNotices();
  const notified = result.couponUsers + result.pointUsers;

  return {
    body: result,
    // 알린 날만 남긴다. 0건인 날까지 남기면 봐야 할 줄이 묻힌다
    audits: notified > 0
      ? [{
          action: 'notices.expiry',
          targetType: 'user' as const,
          targetId: `${notified}명`,
          after: result,
        }]
      : [],
  };
});
