import { NextResponse } from 'next/server';
import { cartSyncSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { mergeServerCart } from '~/lib/cart/server-cart';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = cartSyncSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  return NextResponse.json({ items: await mergeServerCart(user.id, parsed.data.lines) });
}
