import { redirect } from 'next/navigation';
import { getViewer } from '~/lib/viewer';
import type { Metadata } from 'next';
import { getDefaultAddress } from '~/lib/queries/orders';
import { CheckoutForm } from '~/components/checkout-form';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('checkout.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const user = await getViewer();
  // 주문 조회·취소·환불이 전부 계정에 묶여 있어 비회원 주문은 지원하지 않는다
  if (!user) redirect('/login?next=/checkout');

  const [address, t] = await Promise.all([getDefaultAddress(user.id), getT()]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-32 md:px-10">
      <h1 className="pt-8 pb-4 text-xl font-semibold tracking-tight md:text-2xl">
        {t('checkout.heading')}
      </h1>
      <CheckoutForm defaultAddress={address} />
    </div>
  );
}
