import { NextResponse } from 'next/server';
import { suspendUserSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { suspendUser, AccessError } from '~/lib/admin/manage-access';
import { notifySuspension } from '~/lib/account/notify-account';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/** 회원 이용 정지·해제. 사유와 함께 감사 로그에 남긴다 — 당사자가 물으면 이것으로 답한다 */
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

  const parsed = suspendUserSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await suspendUser(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: parsed.data.action === 'SUSPEND' ? 'user.suspend' : 'user.restore',
      targetType: 'user',
      targetId: id,
      before,
      after,
      request,
    });
    // 정지된 사람은 로그인이 막혀서야 안다 — "비밀번호가 틀렸나" 로 먼저 읽는다. 사유와 함께 메일로 알린다
    await notifySuspension({
      userId: id,
      action: parsed.data.action,
      reason: parsed.data.action === 'SUSPEND' ? parsed.data.reason : null,
    });
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
