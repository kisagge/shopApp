import { NextResponse } from 'next/server';
import { applyDeposit } from '~/lib/payments/deposit';

/**
 * 토스 웹훅.
 *
 * **본문을 믿지 않는다.** 이 주소는 공개돼 있어서 누구나 아무 내용이나
 * 보낼 수 있다. 본문의 status 를 보고 주문을 결제 완료로 바꾸면, 돈을
 * 한 푼도 내지 않고 주문을 통과시키는 길이 열린다.
 *
 * 본문에서 꺼내는 것은 **paymentKey 하나뿐**이고, 그것도 "이 결제를 가서
 * 확인해라" 는 지시로만 쓴다. 상태와 금액은 토스 API 에 직접 물어서 가져온다.
 * 서명 검증 대신 이 방식을 택한 이유는, 서명이 맞더라도 본문이 낡았을 수
 * 있고(재전송·순서 뒤바뀜) 조회는 언제나 지금의 진실을 주기 때문이다.
 *
 * 항상 200 을 돌려준다. 4xx·5xx 를 주면 토스가 계속 재시도하는데,
 * 우리 결제가 아니거나 이미 처리한 건은 몇 번을 다시 받아도 결과가 같다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ received: true, reason: '본문을 읽지 못했습니다' });
  }

  const paymentKey =
    typeof body === 'object' && body !== null && 'data' in body
      ? // v2 는 { eventType, data: { paymentKey, ... } } 로 온다
        (body as { data?: { paymentKey?: unknown } }).data?.paymentKey
      : (body as { paymentKey?: unknown } | null)?.paymentKey;

  if (typeof paymentKey !== 'string' || paymentKey.length === 0) {
    return NextResponse.json({ received: true, reason: 'paymentKey 가 없습니다' });
  }

  try {
    const outcome = await applyDeposit(paymentKey);
    if (!outcome.applied) {
      // 정상적인 경우도 많다(이미 반영·입금 전). 시끄럽게 만들지 않는다.
      return NextResponse.json({ received: true, applied: false, reason: outcome.reason });
    }
    return NextResponse.json({ received: true, applied: true, orderNo: outcome.orderNo });
  } catch (error) {
    // 여기서 500 을 주면 토스가 재시도한다. 그편이 맞다 — 우리 쪽 장애다.
    console.error('[webhook] 입금 반영 실패', { paymentKey }, error);
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
