import { NextResponse } from 'next/server';
import { updateShippingPolicySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateShippingPolicy } from '~/lib/admin/manage-shipping';
import { recordAudit } from '~/lib/audit';
import { revalidateShipping } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { apiError, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 배송비 정책 수정.
 *
 * **무료 기준 하나가 모든 주문의 금액을 바꾼다.** 그래서 되돌릴 수 있어야
 * 하고, 되돌리려면 전에 무엇이었는지 남아 있어야 한다 — 감사 로그에 전후를
 * 함께 적는다.
 *
 * **고친 값이 곧바로 서야 한다.** 정책 자체가 캐시를 지나고(요청마다 한 줄짜리 표를
 * 묻지 않으려고), 매대와 상품 화면도 무료배송 기준을 적어 둔다. 안 털면 결제는 새
 * 값으로 계산하는데 화면은 옛 값을 적고 있다 — 손님이 보는 금액과 내는 금액이 갈린다.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = updateShippingPolicySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const { before, after } = await updateShippingPolicy(actor, parsed.data);
    // 정책 자체의 캐시와, 무료배송 기준을 적어 둔 매대를 함께 턴다
    revalidateShipping();
    await recordAudit({
      actor,
      action: 'shipping.update',
      targetType: 'shipping',
      targetId: 'default',
      before,
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await apiError(error);
  }
}
