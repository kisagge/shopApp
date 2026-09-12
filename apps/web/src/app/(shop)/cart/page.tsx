import type { Metadata } from 'next';
import { CartView } from '~/components/cart-view';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('cart.heading'), ...NO_INDEX };
}

export default async function CartPage() {
  const t = await getT();

  return (
    <div className="mx-auto w-full max-w-[720px] md:px-10">
      <h1 className="px-4 pt-8 pb-4 text-xl font-semibold tracking-tight md:px-0 md:text-2xl">
        {t('cart.heading')}
      </h1>
      <CartView />
    </div>
  );
}
