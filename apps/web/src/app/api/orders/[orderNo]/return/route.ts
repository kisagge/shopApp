import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { returnRequestSchema } from '@shop/contract';
import { requestReturn, cancelOwnReturn } from '~/lib/orders/return-request';
import { apiError, unauthorized } from '~/lib/api/respond';
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
    return await apiError(error);
  }
}

/**
 * 손님이 자기 신청을 무른다.
 *
 * **들어가면 나올 문이 없었다.** 무르는 창구가 운영진 쪽에만 있어서, 잘못 신청하면 주문이 반품접수에 갇혀
 * 구매확정도 자동 확정도 안 됐다(적립금이 안 나오고 후기도 못 쓴다). 운영진은 "반려" 로 처리할 수밖에
 * 없었고, 거절한 적이 없는데 거절로 남았다.
 *
 * 승인 전까지만 된다 — 그 판단은 core 가 한다.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const { orderNo } = await params;

  try {
    const result = await cancelOwnReturn(orderNo, user);
    // 교환 신청이 잡아 둔 재고가 풀렸다 — 품절로 보이던 옵션이 다시 보여야 한다
    revalidateCatalog();
    return NextResponse.json(result);
  } catch (error) {
    return await apiError(error);
  }
}
