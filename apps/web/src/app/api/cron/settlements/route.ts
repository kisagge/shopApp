import { NextResponse } from 'next/server';
import { previousYearMonth } from '@shop/core';
import { authorizeCron } from '~/lib/cron';
import { closeSettlements, SettlementCloseError } from '~/lib/admin/close-settlement';
import { recordAudit } from '~/lib/audit';

/**
 * 월 정산 확정 배치. 매달 1일 KST 05:00 (UTC 20:00 전날) 에 돈다.
 *
 * 앞 달을 대상으로 한다. 여러 번 돌아도 결과가 같으므로 재실행이 안전하다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizeCron(request);
  if (!auth.ok) {
    return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
  }

  const yearMonth = previousYearMonth(new Date());

  try {
    const result = await closeSettlements(auth.actor, yearMonth);

    // 아무것도 안 바뀌었으면 기록하지 않는다. 매달 "0건" 줄로 감사 로그를
    // 채우면 정작 봐야 할 줄이 묻힌다.
    if (result.created > 0 || result.updated > 0) {
      await recordAudit({
        actor: auth.actor,
        action: 'settlement.close',
        targetType: 'settlement',
        targetId: yearMonth,
        after: result,
        request,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SettlementCloseError) {
      // 배치는 사람이 안 보므로 로그에 남겨야 한다
      console.error('[cron] 정산 확정 실패', { yearMonth, code: error.code, message: error.message });
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
