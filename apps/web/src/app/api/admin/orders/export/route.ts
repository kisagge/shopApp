import { NextResponse } from 'next/server';
import { CARRIERS, ForbiddenError, ORDER_STATUS, ORDER_STATUS_LABEL, csvDocument } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { exportAdminOrders, ExportTooLargeError } from '~/lib/queries/admin/orders';
import { ScopeError } from '~/lib/queries/admin/scope';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/**
 * 주문 내려받기(CSV).
 *
 * **목록 화면과 같은 조건으로 나간다** — 주소의 status·q·from·to 를 그대로 받고,
 * 조건을 만드는 함수도 목록과 하나다(adminOrderWhere). 화면에 30건이 보이는데 파일에
 * 300건이 들어 있으면, 운영자는 무엇을 발송해야 하는지 알 수 없다.
 *
 * **감사 로그에 남긴다.** 한 파일에 수천 명의 이름·연락처·주소가 들어 있다. 누가
 * 언제 어떤 조건으로 몇 줄을 가져갔는지 남아야, 새 나갔을 때 어디서 나갔는지 안다.
 *
 * GET 이 아니라 POST 다. 링크로 걸어 두거나 브라우저가 미리 받아 두는 것만으로
 * 개인정보 파일이 만들어지고 감사 로그가 쌓이면 안 된다.
 */

const HEADER = [
  '주문번호', '주문일시', '상태',
  '받는 사람', '연락처', '우편번호', '주소', '배송 메모',
  '상품', '옵션', '수량', '금액',
  '택배사', '송장번호',
] as const;

const carrierName = (code: string | null): string =>
  code ? (CARRIERS.find((c) => c.code === code)?.name ?? code) : '';

const kst = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

export async function POST(request: Request): Promise<Response> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('orderExport', request, actor.id);
  if (limited) return limited;

  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status');
  const status = ORDER_STATUS.find((s) => s === rawStatus);
  const filter = {
    status,
    q: url.searchParams.get('q') ?? undefined,
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  };

  try {
    const rows = await exportAdminOrders(actor, filter);

    await recordAudit({
      actor,
      action: 'order.export',
      targetType: 'order',
      targetId: 'export',
      after: { rows: rows.length, ...filter },
      request,
    });

    const body = csvDocument(
      HEADER,
      rows.map((r) => [
        r.orderNo,
        kst.format(r.placedAt),
        ORDER_STATUS_LABEL[r.status],
        r.recipient,
        r.recipientPhone,
        r.postalCode,
        r.address,
        r.deliveryMemo,
        r.productName,
        r.optionLabel,
        r.quantity,
        r.subtotal,
        carrierName(r.carrier),
        r.trackingNumber,
      ]),
    );

    const stamp = kst.format(new Date()).replace(/[^\d]/g, '').slice(0, 12);
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        // 한글 파일명은 filename* 로. 옛 브라우저를 위해 ASCII 이름도 함께 둔다
        'content-disposition': `attachment; filename="orders-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`주문-${stamp}.csv`)}`,
        // 개인정보가 든 파일이다. 어디에도 남기지 않는다
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ExportTooLargeError) {
      return NextResponse.json({ code: 'EXPORT_TOO_LARGE', message: error.message }, { status: 413 });
    }
    // 소속 없는 가맹점 계정은 볼 범위가 없다 — 권한 없음과 같게 답한다
    if (error instanceof ForbiddenError || error instanceof ScopeError) {
      return await forbidden();
    }
    throw error;
  }
}
