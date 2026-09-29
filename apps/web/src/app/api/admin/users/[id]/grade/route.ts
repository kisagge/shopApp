import { NextResponse } from 'next/server';
import { setGradeSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { setUserGrade } from '~/lib/admin/manage-access';
import { recordAudit } from '~/lib/audit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 회원 등급 올려 주기.
 *
 * **쓰는 코드가 앱 전체에 하나도 없었다.** 제휴·보상·민원 무마로 VIP 를 주려면 DB 를 직접 만져야 했고,
 * 등급에는 적립률이 붙어 있으니 그건 곧 돈인데 **감사 로그도 안 남았다.**
 *
 * 사유를 받는다 — 나중에 "왜 이 사람만 VIP 인가" 에 답할 수 있어야 한다(정지와 같은 판단).
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, setGradeSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const result = await setUserGrade(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'user.setGrade',
      targetType: 'user',
      targetId: id,
      before: { grade: result.before },
      after: { grade: result.after, reason: parsed.data.reason },
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
