import type { Metadata } from 'next';
import { CartView } from '~/components/cart-view';
import { NO_INDEX } from '~/lib/no-index';

export const metadata: Metadata = {
  title: '장바구니',
  ...NO_INDEX,
};

export default function CartPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] md:px-10">
      <h1 className="px-4 pt-8 pb-4 text-xl font-semibold tracking-tight md:px-0 md:text-2xl">
        장바구니
      </h1>
      <CartView />
    </div>
  );
}
