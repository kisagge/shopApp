import type { Metadata } from 'next';
import { format } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getShippingPolicy } from '~/lib/shipping-policy';
import { ShippingPolicyForm } from './shipping-form';
import { getReturnAddress } from '~/lib/orders/return-address';
import { ReturnAddressForm } from '~/components/admin/return-address-form';
import { LastEdited } from '~/components/admin/last-edited';
import { getReturnAddressEdit, getShippingPolicyEdit } from '~/lib/queries/admin/last-edit';

export const metadata: Metadata = { title: '배송비' };
export const dynamic = 'force-dynamic';

export default async function AdminShippingPage() {
  const actor = await requireAdmin('shipping:write');
  const [policy, returnAddress, policyEdit, returnEdit] = await Promise.all([
    getShippingPolicy(), getReturnAddress(null), getShippingPolicyEdit(actor), getReturnAddressEdit(actor, null),
  ]);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">배송비</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">가게 전체에 적용됩니다</p>
      </header>

      <div className="flex flex-col gap-5 p-8">
        <section
          aria-labelledby="policy-title"
          className="max-w-[560px] rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-5 flex flex-col gap-1">
            <h2 id="policy-title" className="text-base font-semibold">현재 정책</h2>
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              {/*
                **바꾸면 곧바로 모든 주문의 금액이 달라진다.** 상품 화면의 안내,
                장바구니 견적, 결제 금액이 전부 이 값을 읽는다. 그 사실을 적어 두는
                이유는, 이 화면이 "설정 한 줄" 처럼 보이는데 실제로는 매출에 닿기
                때문이다.
              */}
              지금은 <b className="tnum">{format(policy.baseFee)}</b>이고,{' '}
              {policy.freeThreshold === null ? (
                <b>무료배송을 하지 않습니다</b>
              ) : (
                <>
                  <b className="tnum">{format(policy.freeThreshold)}</b> 이상이면 무료입니다
                </>
              )}
              . 제주·도서산간은 <b className="tnum">{format(policy.remoteSurcharge)}</b>을 더
              받습니다. <b>저장하면 곧바로 모든 주문에 적용됩니다</b> — 상품 화면의 안내와
              결제 금액이 함께 바뀝니다.
            </p>
            {policyEdit && <LastEdited at={policyEdit.at.toISOString()} by={policyEdit.by} />}
          </div>

          <ShippingPolicyForm
            baseFee={policy.baseFee}
            freeThreshold={policy.freeThreshold}
            remoteSurcharge={policy.remoteSurcharge}
          />
        </section>

        {/*
          자사 상품(가맹점이 없는 브랜드)을 돌려받는 곳. 가맹점 상품은 가맹점마다 제 반품지가 있다 — 가맹점 화면에서 고친다.
          배송 정책처럼 가게 전체의 약속이라 이 화면에 둔다.
        */}
        <section
          aria-labelledby="platform-return-title"
          className="flex max-w-[560px] flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="platform-return-title" className="text-base font-semibold">자사 상품 반품지</h2>
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              가맹점이 없는 자사 브랜드 상품의 반품·교환을 승인하면 손님에게 이 주소를 안내합니다. 가맹점 상품은 가맹점
              화면에서 가맹점마다 등록합니다.
            </p>
            {returnEdit && <LastEdited at={returnEdit.at.toISOString()} by={returnEdit.by} />}
            {!returnAddress && (
              <p className="mt-1 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
                아직 등록하지 않았습니다. 등록하기 전에는 자사 상품의 반품·교환을 승인할 수 없습니다.
              </p>
            )}
          </div>
          <ReturnAddressForm owner="platform" initial={returnAddress} />
        </section>
      </div>
    </>
  );
}
