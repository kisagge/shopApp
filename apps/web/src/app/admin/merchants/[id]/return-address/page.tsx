import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEditReturnAddress } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getMerchantReturnAddress } from '~/lib/orders/return-address';
import { ReturnAddressForm } from '~/components/admin/return-address-form';
import { LastEdited } from '~/components/admin/last-edited';
import { getReturnAddressEdit } from '~/lib/queries/admin/last-edit';

export const metadata: Metadata = { title: '반품지' };
export const dynamic = 'force-dynamic';

/**
 * 한 가맹점의 반품지.
 *
 * 가맹점은 자기 것만 연다 — 남의 가맹점 id 를 치면 없는 화면으로 답한다(있는지조차 새지 않게). 반품지가 없으면 이 가맹점
 * 상품의 반품을 승인할 수 없다는 것을 먼저 말한다 — 등록하러 온 이유다.
 */
export default async function MerchantReturnAddressPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin('merchant:read');
  const { id } = await params;
  if (!canEditReturnAddress(actor, id)) notFound();

  const [merchant, edit] = await Promise.all([getMerchantReturnAddress(id), getReturnAddressEdit(actor, id)]);
  if (!merchant) notFound();
  const { address } = merchant;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <nav aria-label="현재 위치">
          <ol className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--fg-muted)]">
            <li>
              <Link href="/admin/merchants" className="no-underline hover:underline">가맹점</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">{merchant.name} 반품지</h1>
            </li>
          </ol>
        </nav>
      </header>

      <div className="p-4 sm:p-8">
        <section
          aria-labelledby="return-address-title"
          className="flex max-w-[560px] flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="return-address-title" className="text-base font-semibold">반품 받을 주소</h2>
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              반품·교환을 승인하면 손님의 주문 화면과 승인 메일에 이 주소가 보내실 곳으로 적힙니다.
            </p>
            {edit && <LastEdited at={edit.at.toISOString()} by={edit.by} />}
            {!address && (
              <p className="mt-1 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
                아직 등록하지 않았습니다. 등록하기 전에는 이 가맹점 상품의 반품·교환을 승인할 수 없습니다.
              </p>
            )}
          </div>
          <ReturnAddressForm owner={id} initial={address} />
        </section>
      </div>
    </>
  );
}
