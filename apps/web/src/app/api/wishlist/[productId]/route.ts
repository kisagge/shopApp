import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { addToWishlist, removeFromWishlist, WishlistError } from '~/lib/wishlist/wishlist';

/**
 * 찜 넣기·빼기.
 *
 * PUT 과 DELETE 로 나눴다. 토글 하나면 같은 요청이 두 번 갔을 때 원래대로
 * 돌아간다 — 연타나 재시도에서 실제로 일어나는 일이다. 이렇게 두면
 * 몇 번을 보내도 결과가 같다.
 */
function requireUser(user: { id: string } | null): NextResponse | null {
  if (user) return null;
  return NextResponse.json(
    { code: 'UNAUTHORIZED', message: '찜하려면 로그인이 필요합니다.' },
    { status: 401 },
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  const denied = requireUser(user);
  if (denied || !user) return denied!;

  const { productId } = await params;

  try {
    await addToWishlist(user.id, productId);
    return NextResponse.json({ wishlisted: true });
  } catch (error) {
    if (error instanceof WishlistError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  const denied = requireUser(user);
  if (denied || !user) return denied!;

  const { productId } = await params;
  await removeFromWishlist(user.id, productId);
  return NextResponse.json({ wishlisted: false });
}
