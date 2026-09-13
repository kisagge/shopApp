import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { updateShippingPolicySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateShippingPolicy } from '~/lib/admin/manage-shipping';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 배송비 정책 수정.
 *
 * **무료 기준 하나가 모든 주문의 금액을 바꾼다.** 그래서 되돌릴 수 있어야
 * 하고, 되돌리려면 전에 무엇이었는지 남아 있어야 한다 — 감사 로그에 전후를
 * 함께 적는다.
 *
 * 매대와 상품 화면이 무료배송 기준을 적어 두므로 캐시도 함께 턴다. 안 털면
 * 결제는 새 값으로 계산하는데 상품 화면은 옛 값을 적고 있다.
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
    revalidateCatalog();
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
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
