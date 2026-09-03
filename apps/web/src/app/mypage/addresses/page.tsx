import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@shop/auth/session';
import { listAddresses } from '~/lib/addresses/manage-address';
import { AddressBook } from '~/components/address-book';

export const metadata: Metadata = { title: '배송지 관리' };
export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/addresses');

  const addresses = await listAddresses(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-1 text-xl font-semibold tracking-tight md:text-2xl">배송지 관리</h1>
      <p className="pb-6 text-[13px] text-[var(--fg-secondary)]">
        기본 배송지는 주문할 때 처음 선택됩니다.
      </p>
      <AddressBook initial={addresses} />
    </div>
  );
}
