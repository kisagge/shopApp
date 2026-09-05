import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { resolveReturnSchema } from '@shop/contract';
import { resolveReturn, ReturnError } from '~/lib/orders/return-request';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

/** 운영진의 반품 승인·반려 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = resolveReturnSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    const result = await resolveReturn(orderNo, parsed.data, actor);

    // 돈과 재고가 걸린 판단이라 누가 언제 했는지 남긴다
    await recordAudit({
      actor,
      action: 'order.resolveReturn',
      targetType: 'order',
      targetId: result.orderNo,
      after: result,
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReturnError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
