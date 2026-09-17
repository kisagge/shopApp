import { NextResponse } from 'next/server';
import { updateMerchantStatusSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { updateMerchantStatus, AccessError } from '~/lib/admin/manage-access';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';
import { revalidateCatalog } from '~/lib/cache';

/** 입점 승인·정지. 슈퍼관리자만. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const parsed = updateMerchantStatusSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await updateMerchantStatus(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: `merchant.${parsed.data.status.toLowerCase()}`,
      targetType: 'merchant',
      targetId: id,
      before: { status: before.status },
      after: { status: after.status, reason: parsed.data.reason },
      request,
    });
    /*
     * **매대는 승인된 가맹점 상품만 보여 준다(shelf 의 조건).** 안 털면 정지한 가맹점의 상품이 캐시 수명만큼
     * 계속 팔리고, 방금 승인한 가맹점의 상품은 그만큼 안 보인다.
     */
    revalidateCatalog();
    return NextResponse.json(after);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
