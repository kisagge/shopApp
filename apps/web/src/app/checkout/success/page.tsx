import { redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import type { Metadata } from 'next';
import { PaymentError } from '@shop/core';
import { confirmPayment, ConfirmError } from '~/lib/orders/confirm-payment';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('checkout.confirming'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/**
 * 토스 결제창이 돌아오는 자리.
 *
 * **승인을 서버에서 한다.** 클라이언트에서 fetch 로 승인하면, 결제창이
 * 닫히고 이 화면이 뜨는 사이에 사용자가 탭을 닫으면 승인이 영영 안 일어난다.
 * 돈은 토스에 잡혀 있는데 우리 주문은 미결제로 남는 최악의 상태다.
 * 서버 컴포넌트에서 승인하면 이 요청이 처리되는 것만으로 끝난다.
 *
 * 쿼리로 오는 값은 전부 **믿지 않는다.** amount 는 주문에 저장된 금액과
 * 대조만 하고, 승인은 저장된 값으로 나간다. orderId 도 세션 사용자의
 * 주문인지 확인한 뒤에만 쓴다.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string): string | null => {
    const value = params[key];
    return typeof value === 'string' ? value : null;
  };

  const paymentKey = one('paymentKey');
  const orderNo = one('orderId');
  const amount = Number(one('amount'));

  if (!paymentKey || !orderNo || !Number.isInteger(amount)) {
    redirect('/checkout/fail?code=INVALID_CALLBACK');
  }

  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent('/order/' + orderNo)}`);

  try {
    await confirmPayment({ orderNo, paymentKey, amount }, user);
  } catch (error) {
    /**
     * **승인이 못 나는 이유는 두 종류다.**
     *
     * 우리가 먼저 막는 것(`ConfirmError` — 없는 주문, 이미 처리됨)과 결제
     * 자체가 거절되는 것(`PaymentError` — 금액 불일치, 한도 초과, PG 장애).
     * 뒤쪽을 빠뜨리고 있었다: 쿼리의 금액을 고쳐 들어오면 승인은 제대로
     * 막았지만 화면이 오류 번호만 띄웠다. 막은 것은 맞는데, 사람은 자기
     * 주문이 어떻게 됐는지 한 글자도 못 봤다.
     */
    if (error instanceof PaymentError) {
      redirect(`/order/${orderNo}?payment=failed&reason=${encodeURIComponent(error.code)}`);
    }
    if (error instanceof ConfirmError) {
      /**
       * 주문 자체가 없으면 실패 화면으로 보낸다.
       *
       * 없는 주문의 주문 화면으로 보내면 맨 404 가 뜬다. 결제가 어떻게 됐는지
       * 한 글자도 못 보는 셈이다. 낡은 콜백 주소를 다시 열었거나 남의 주문
       * 번호로 들어온 경우라 실제로 일어난다.
       */
      if (error.code === 'ORDER_NOT_FOUND') {
        redirect('/checkout/fail?code=ORDER_NOT_FOUND');
      }
      /**
       * 그 밖의 실패는 주문 화면으로 보낸다. 주문은 이미 만들어져 있고
       * 거기서 다시 시도할 수 있다 — 실패 화면에 세워 두면 자기 주문이
       * 어떻게 됐는지 알 수 없다.
       */
      redirect(`/order/${orderNo}?payment=failed&reason=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }

  redirect(`/order/${orderNo}?payment=done`);
}
