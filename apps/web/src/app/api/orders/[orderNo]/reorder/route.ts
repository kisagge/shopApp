import { NextResponse } from 'next/server';
import { reorderRequestSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { planReorderFor } from '~/lib/orders/reorder';
import { validationFailed } from '~/lib/i18n/validation';
import { getT } from '~/lib/i18n/server';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 지난 주문 다시 담기 — 담을 줄을 계산해 돌려준다. 장바구니는 화면이 채운다.
 *
 * 쓰는 것이 없어서 감사 기록도 없다. 견적과 같은 칸으로 센다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return await unauthorized();

  const limited = await enforceRateLimit('quote', request, user.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }
  const parsed = reorderRequestSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { orderNo } = await params;
  const plan = await planReorderFor(user.id, orderNo, parsed.data.cartVariantIds);
  if (!plan) {
    // 남의 주문도 없는 주문과 똑같이 답한다
    return NextResponse.json(
      { code: 'ORDER_NOT_FOUND', message: (await getT())('reorder.notFound') },
      { status: 404 },
    );
  }
  return NextResponse.json(plan);
}
