import { redirect } from 'next/navigation';
import { getShippingPolicy } from '~/lib/shipping-policy';
import { getViewer } from '~/lib/viewer';
import type { Metadata } from 'next';
import { getDefaultAddress } from '~/lib/queries/orders';
import { CheckoutForm } from '~/components/checkout-form';
import { CheckoutUnavailable } from '~/components/checkout/unavailable';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { serverPaymentMode } from '~/lib/payments';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('checkout.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ now?: string }>;
}) {
  // 바로 구매로 왔는가 — 장바구니 대신 그 하나를 산다(stores/buy-now)
  const buyNow = (await searchParams).now === '1';
  const user = await getViewer();
  /*
   * 주문 조회·취소·환불이 전부 계정에 묶여 있어 비회원 주문은 지원하지 않는다.
   * 돌아올 주소에 바로 구매를 남긴다 — 빠뜨리면 로그인하고 돌아와 장바구니를 산다.
   */
  // 고정된 경로라 인코딩하지 않는다(마이페이지들과 같은 모양) — 쿼리 값 안의 `?` 는 그대로 읽힌다
  if (!user) redirect(buyNow ? '/login?next=/checkout?now=1' : '/login?next=/checkout');

  const [address, t] = await Promise.all([getDefaultAddress(user.id), getT()]);

  /*
   * **결제 방식은 서버가 정하고 브라우저는 받아서 쓴다.**
   *
   * 전에는 양쪽이 각자 정했다 — 브라우저는 클라이언트 키를, 서버는 시크릿
   * 키를 봤다. 배포에 두 키가 다 없자 브라우저만 "Mock 으로 간다" 고 정하고
   * 주문을 만들었고, 확정 창구는 게이트웨이를 만들다 던져 500 이 났다.
   * 주문은 남고 결제만 없는 상태가 실제로 생겼다(20260910-7063897).
   */
  const payment = serverPaymentMode();

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-32 md:px-10">
      <h1 className="pt-8 pb-4 text-xl font-semibold tracking-tight md:text-2xl">
        {t('checkout.heading')}
      </h1>
      {payment.mode === 'blocked' ? (
        <CheckoutUnavailable />
      ) : (
        <CheckoutForm
          buyNow={buyNow}
          defaultAddress={address}
          paymentMode={payment.mode}
          remoteSurcharge={(await getShippingPolicy()).remoteSurcharge}
        />
      )}
    </div>
  );
}
