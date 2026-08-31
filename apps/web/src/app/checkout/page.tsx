import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@shop/auth/session';
import { getDefaultAddress } from '~/lib/queries/orders';
import { CheckoutForm } from '~/components/checkout-form';

export const metadata: Metadata = { title: '주문 / 결제' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const user = await getSessionUser(await headers());
  // 주문 조회·취소·환불이 전부 계정에 묶여 있어 비회원 주문은 지원하지 않는다
  if (!user) redirect('/login?next=/checkout');

  const address = await getDefaultAddress(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-32 md:px-10">
      <h1 className="pt-8 pb-4 text-xl font-semibold tracking-tight md:text-2xl">주문 / 결제</h1>
      <CheckoutForm defaultAddress={address} />
    </div>
  );
}
