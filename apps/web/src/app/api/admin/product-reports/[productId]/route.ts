import { NextResponse } from 'next/server';
import { resolveProductReportSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { hasPermission } from '@shop/core';
import { resolveProductReports } from '~/lib/admin/manage-product-reports';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 상품 신고 처리.
 *
 * **카탈로그를 턴다.** 내린 상품은 매대·검색에서 빠져야 하고, 안 털면 캐시 수명만큼 계속
 * 팔린다. 문제없음으로 닫은 건은 상품이 그대로이므로 털 것이 없지만, 여기서 갈라 적지
 * 않는다 — 터는 비용은 작고, 갈라 적으면 "어느 갈래에서 털었나" 를 다음 사람이 세어야 한다.
 *
 * 누가 무엇을 판단했는지 감사 로그에 남긴다. 신고 처리는 **남의 매출을 내리는 일**이라
 * 되돌릴 때 근거가 필요하다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문보다 먼저 본다 — 반대면 무엇을 보내야 통과하는지 알려 주게 된다
  if (!hasPermission(actor, 'product:moderate')) {
    return await forbidden();
  }

  const parsed = await readBody(request, resolveProductReportSchema);
  if (!parsed.ok) return parsed.response;

  const { productId } = await params;

  try {
    const result = await resolveProductReports(actor, productId, parsed.data.resolution);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: result.resolution === 'archived' ? 'productReport.archive' : 'productReport.keep',
      targetType: 'product',
      targetId: productId,
      after: { resolution: result.resolution, resolved: result.resolved },
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
