import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { returnRequestSchema } from '@shop/contract';
import { requestReturn, ReturnError } from '~/lib/orders/return-request';
import { unauthorized } from '~/lib/api/respond';
import { revalidateCatalog } from '~/lib/cache';
import { notifyReturnRequested } from '~/lib/notifications/console-work';
import { validationFailed } from '~/lib/i18n/validation';

/** 고객의 반품·교환 신청 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const parsed = returnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 문구는 계약의 열쇠에서 나오고, 번역은 이 응답을 만들 때 한다
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    const result = await requestReturn(orderNo, parsed.data, user);
    // 교환 신청은 바꿀 옵션의 재고를 잡는다 — 안 털면 마지막 한 장이 캐시 수명만큼 남아 있는 것으로 보인다
    revalidateCatalog();
    // 처리할 사람에게 알린다 — 목록을 열어 보기 전까지 아무도 몰랐다
    await notifyReturnRequested({ orderNo: result.orderNo, itemIds: result.itemIds });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ReturnError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
