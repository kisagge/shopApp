import { NextResponse } from 'next/server';
import { ForbiddenError, SettlementError, csvDocument } from '@shop/core';
import { getActor } from '@shop/auth/session';
import {
  exportSettlementLines, SettlementExportTooLargeError, SETTLEMENT_CSV_HEADER,
} from '~/lib/admin/settlement-export';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/**
 * 정산 내역 내려받기(CSV). `?period=2026-08` 과, 운영진이면 `&merchant=<id>`.
 *
 * **GET 이다.** 손님의 정보가 없고(주문번호·상품·금액) 읽기만 한다 — 정산 화면에서 링크로 받는다.
 * 가맹점 계정은 merchant 를 무엇으로 보내도 자기 것만 받는다.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('settlementExport', request, actor.id);
  if (limited) return limited;

  const url = new URL(request.url);
  const period = url.searchParams.get('period') ?? '';
  const merchant = url.searchParams.get('merchant') || undefined;

  try {
    const body = csvDocument(SETTLEMENT_CSV_HEADER, await exportSettlementLines(actor, period, merchant));
    const name = `정산-${period}${actor.merchantId || merchant ? '-가맹점' : ''}.csv`;
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="settlement-${period}.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // 열린 기간은 매일 바뀐다. 어제 받은 파일이 오늘 받은 것처럼 보이면 안 된다
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof SettlementError) {
      return NextResponse.json({ code: 'INVALID_PERIOD', message: error.message }, { status: 400 });
    }
    if (error instanceof SettlementExportTooLargeError) {
      return NextResponse.json({ code: 'EXPORT_TOO_LARGE', message: error.message }, { status: 413 });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
