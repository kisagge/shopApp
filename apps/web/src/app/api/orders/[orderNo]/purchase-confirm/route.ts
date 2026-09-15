import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { confirmPurchase, ConfirmPurchaseError } from '~/lib/orders/confirm-purchase';
import { enforceRateLimit } from '~/lib/rate-limit';
import { unauthorized } from '~/lib/api/respond';

/**
 * 손님의 구매확정. 되돌릴 수 없어 화면이 한 번 더 묻고, 서버는 자기 주문·배송완료·반품 없음을 다시 본다.
 *
 * (`confirm` 은 결제 승인 창구다 — 이름이 겹쳐 이쪽은 purchase-confirm 이다.)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  const { orderNo } = await params;
  try {
    return NextResponse.json(await confirmPurchase(orderNo, user));
  } catch (error) {
    if (error instanceof ConfirmPurchaseError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
