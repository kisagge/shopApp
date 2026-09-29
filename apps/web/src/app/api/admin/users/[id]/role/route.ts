import { NextResponse } from 'next/server';
import { assignRoleSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { assignRole } from '~/lib/admin/manage-access';
import { recordAudit } from '~/lib/audit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 권한 부여. 슈퍼관리자만, 자기 자신은 제외. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, assignRoleSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const { before, after } = await assignRole(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'user.assignRole',
      targetType: 'user',
      targetId: id,
      before,
      after: { role: after.role, merchantId: after.merchantId, reason: parsed.data.reason },
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await apiError(error);
  }
}
