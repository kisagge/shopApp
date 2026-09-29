import { NextResponse } from 'next/server';
import { cartSyncSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { getServerCart, replaceServerCart } from '~/lib/cart/server-cart';
import { readBody } from '~/lib/api/read-body';

/** 서버에 저장된 장바구니를 읽는다. 비로그인이면 빈 목록이다. */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: await getServerCart(user.id) });
}

/**
 * 장바구니를 통째로 저장한다.
 *
 * 비로그인이면 **조용히 성공으로 답한다.** 저장할 곳이 없을 뿐 잘못된
 * 요청이 아니고, 화면이 오류를 띄울 일도 아니다.
 */
export async function PUT(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return NextResponse.json({ saved: false });

  const parsed = await readBody(request, cartSyncSchema);
  if (!parsed.ok) return parsed.response;

  await replaceServerCart(user.id, parsed.data.lines);
  return NextResponse.json({ saved: true });
}
