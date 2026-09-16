import { NextResponse } from 'next/server';
import { cartOptionsQuerySchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getCartOptions } from '~/lib/cart/options';
import { validationFailed } from '~/lib/i18n/validation';
import { getT } from '~/lib/i18n/server';

/**
 * 장바구니 한 줄의 바꿀 수 있는 옵션들.
 *
 * 로그인 없이 연다 — 비회원도 장바구니를 쓴다. 읽기뿐이고 견적과 같은 칸으로 센다
 * (수량을 바꾸듯 옵션을 고르는 동작이다).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  const limited = await enforceRateLimit('quote', request, user?.id ?? null);
  if (limited) return limited;

  const parsed = cartOptionsQuerySchema.safeParse({
    variantId: new URL(request.url).searchParams.get('variantId'),
  });
  if (!parsed.success) return validationFailed(parsed.error);

  const options = await getCartOptions(parsed.data.variantId);
  if (!options) {
    return NextResponse.json(
      { code: 'NOT_FOUND', message: (await getT())('product.notFound') },
      { status: 404 },
    );
  }
  return NextResponse.json(options, {
    // 재고가 담긴 답이다. 남의 캐시에 남으면 곧바로 틀린다
    headers: { 'cache-control': 'no-store' },
  });
}
