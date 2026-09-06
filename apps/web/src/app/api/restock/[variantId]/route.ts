import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { subscribeRestock, unsubscribeRestock, RestockError } from '~/lib/restock/notify';
import { unauthorized } from '~/lib/api/respond';

type Params = { params: Promise<{ variantId: string }> };

/**
 * 재입고 알림 신청·해제.
 *
 * PUT/DELETE 로 둔 이유는 찜과 같다 — 토글은 같은 요청이 두 번 가면
 * 원래대로 돌아간다. 연타와 재시도에서 실제로 일어나는 일이다.
 */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const { variantId } = await params;
  try {
    await subscribeRestock(user.id, variantId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RestockError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const { variantId } = await params;
  await unsubscribeRestock(user.id, variantId);
  return NextResponse.json({ ok: true });
}
