import { previousYearMonth } from '@shop/core';
import { cronRoute } from '~/lib/cron';
import { closeSettlements } from '~/lib/admin/close-settlement';

/**
 * 월 정산 확정 배치. 매달 2일 KST 05:00 (UTC 1일 20:00) 에 돈다.
 *
 * **1일이 아니라 2일이다.** 크론은 UTC 로 읽히고 KST 는 아홉 시간 앞이라, UTC 1일 20:00 이 KST 로는 2일
 * 05:00 이다. KST 1일에 돌리려면 크론이 "전달 마지막 날" 을 가리켜야 하는데 그런 표현이 없다 — 앞 달이
 * 확실히 끝난 뒤에 도는 편이 정산에는 맞기도 하다(DEPLOY.md 에 같은 설명이 있다).
 *
 * 앞 달을 대상으로 한다. 여러 번 돌아도 결과가 같으므로 재실행이 안전하다.
 */
export const GET = cronRoute('settlement.close', async (actor) => {
  const yearMonth = previousYearMonth(new Date());
  // 실패하면 감싸개가 로그에 남기고 코드 그대로 돌려보낸다 — 배치는 보는 사람이 없다
  const result = await closeSettlements(actor, yearMonth);

  return {
    body: result,
    // 아무것도 안 바뀌었으면 기록하지 않는다. 매달 "0건" 줄로 감사 로그를
    // 채우면 정작 봐야 할 줄이 묻힌다.
    audits: result.created > 0 || result.updated > 0
      ? [{
          action: 'settlement.close',
          targetType: 'settlement' as const,
          targetId: yearMonth,
          after: result,
        }]
      : [],
  };
});
