import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getSessionUser } from '@shop/auth/session';
import { listAddresses } from '~/lib/addresses/manage-address';
import { AddressBook } from '~/components/address-book';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.addressesHeading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

export default async function AddressesPage() {
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/addresses');
  const t = await getT();

  const addresses = await listAddresses(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-1 text-xl font-semibold tracking-tight md:text-2xl">
        {t('my.addressesHeading')}
      </h1>
      <p className="pb-6 text-[13px] text-[var(--fg-secondary)]">
        {t('my.addressesLead')}
      </p>
      <AddressBook initial={addresses} />
    </div>
  );
}
