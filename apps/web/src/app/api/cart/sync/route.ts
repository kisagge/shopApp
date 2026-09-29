import { NextResponse } from 'next/server';
import { cartSyncSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { mergeServerCart } from '~/lib/cart/server-cart';
import { unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 로그인 직후 장바구니 병합.
 *
 * 비로그인으로 담아 둔 것을 보내면 서버 것과 합쳐 저장하고 결과를 돌려준다.
 * 화면은 돌려받은 것으로 로컬을 갈아 끼운다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  const parsed = await readBody(request, cartSyncSchema);
  if (!parsed.ok) return parsed.response;

  return NextResponse.json({ items: await mergeServerCart(user.id, parsed.data.lines) });
}
