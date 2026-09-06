import { MoneyError } from '@shop/core';
import { enforceRateLimit } from '~/lib/rate-limit';
import { cartQuoteRequestSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { NextResponse } from 'next/server';
import { getQuoteViewer } from '~/lib/grade/effective';
import { quoteCart } from '~/lib/queries/cart';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson } from '~/lib/api/respond';

/**
 * 장바구니 견적.
 *
 * 화면이 보여 주는 금액과 결제될 금액은 항상 이 엔드포인트가 정한다.
 * 요청은 "무엇을 몇 개" 만 담고, 가격·재고·쿠폰·포인트는 전부 서버가 조회한다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const sessionUser = await getSessionUser(request.headers);

  /**
   * 제한을 **본문을 읽기 전에** 건다.
   *
   * 검증 뒤에 두면 형식이 틀린 요청은 400 으로 먼저 빠져나가서 세어지지도
   * 않는다 — 아무 쓰레기나 보내면 제한을 통째로 우회하면서 파싱 비용은
   * 그대로 우리가 낸다.
   *
   * 누구인지는 사용자 id 로, 없으면 해시한 IP 로 센다.
   */
  const limited = await enforceRateLimit('quote', request, sessionUser?.id ?? null);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = cartQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  // 포인트 잔액은 세션이 아니라 DB 를 다시 본다. 세션 캐시가 5분이라 그동안
  // 다른 주문에서 쓴 포인트가 반영되지 않을 수 있다.
  const viewer = sessionUser ? await getQuoteViewer(sessionUser.id) : null;

  try {
    return NextResponse.json(await quoteCart(parsed.data, viewer));
  } catch (error) {
    if (error instanceof MoneyError) {
      return NextResponse.json({ code: 'INVALID_AMOUNT', message: error.message }, { status: 400 });
    }
    throw error;
  }
}
