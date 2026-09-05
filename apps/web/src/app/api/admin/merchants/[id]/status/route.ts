import { NextResponse } from 'next/server';
import { updateMerchantStatusSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { updateMerchantStatus, AccessError } from '~/lib/admin/manage-access';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

/** 입점 승인·정지. 슈퍼관리자만. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
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
    return NextResponse.json(after);
  } catch (error) {
    if (error instanceof AccessError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
    }
    throw error;
  }
}
