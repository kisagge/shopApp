import { getQuoteViewer } from '~/lib/grade/effective';
import { createOrderRequestSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { NextResponse } from 'next/server';
import { createOrder, OrderError } from '~/lib/orders/create-order';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 주문 생성.
 *
 * 로그인이 필요하다. 비회원 주문은 지금 지원하지 않는다 — 주문 조회·취소·환불이
 * 전부 계정에 묶여 있고, 비회원을 끼워 넣으려면 그 경로를 전부 다시 설계해야 한다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const sessionUser = await getSessionUser(request.headers);
  if (!sessionUser) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = createOrderRequestSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  /*
   * 포인트 잔액과 적립률을 DB 에서 다시 낸다.
   *
   * 견적과 **같은 함수**를 쓴다. 한쪽만 고치면 화면에 보여 준 적립 예정
   * 금액과 실제로 쌓이는 금액이 갈라진다.
   */
  const user = await getQuoteViewer(sessionUser.id);
  if (!user) {
    return NextResponse.json(
      { code: 'UNAUTHORIZED', message: '계정을 찾을 수 없습니다.' },
      { status: 401 },
    );
  }

  try {
    const order = await createOrder(parsed.data, user);

    // purchase 이벤트는 여기서 찍지 않는다. 주문이 만들어졌을 뿐 결제는
    // 아직 안 났다. 결제 승인(confirm-payment)이 성립한 순간에만 기록한다 —
    // 그러지 않으면 결제되지 않은 주문까지 매출로 잡힌다.

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) {
      return NextResponse.json(
        {
          code: error.code,
          message: error.message,
          ...(error.variantIds.length > 0 ? { variantIds: error.variantIds } : {}),
        },
        { status: 409 },
      );
    }
    throw error;
  }
}
