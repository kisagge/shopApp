import { NextResponse } from 'next/server';
import { ForbiddenError, csvDocument } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { exportStock, StockExportTooLargeError, STOCK_CSV_HEADER } from '~/lib/admin/bulk-stock';
import { ProductError } from '~/lib/admin/manage-product';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/**
 * 재고 내려받기(CSV).
 *
 * **GET 이다.** 주문 내려받기와 달리 사람의 정보가 없다 — SKU·상품·재고뿐이라 링크로 걸어도
 * 새는 것이 없고, 감사 로그로 남길 이유도 없다. 쓰는 동작은 일괄 수정 창구가 따로 남긴다.
 */
export async function GET(request: Request): Promise<Response> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('stockExport', request, actor.id);
  if (limited) return limited;

  try {
    const body = csvDocument(STOCK_CSV_HEADER, await exportStock(actor));
    const stamp = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()).replace(/[^\d]/g, '').slice(0, 12);

    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="stock-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`재고-${stamp}.csv`)}`,
        // 재고는 계속 바뀐다. 옛 숫자를 받아 고쳐 올리면 그 사이 팔린 만큼이 되살아난다
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof StockExportTooLargeError) {
      return NextResponse.json({ code: 'EXPORT_TOO_LARGE', message: error.message }, { status: 413 });
    }
    if (error instanceof ForbiddenError || error instanceof ProductError) {
      return await forbidden();
    }
    throw error;
  }
}
