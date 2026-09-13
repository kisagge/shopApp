import type { Metadata } from 'next';
import { format } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getShippingPolicy } from '~/lib/shipping-policy';
import { ShippingPolicyForm } from './shipping-form';

export const metadata: Metadata = { title: '배송비' };
export const dynamic = 'force-dynamic';

export default async function AdminShippingPage() {
  await requireAdmin('shipping:write');
  const policy = await getShippingPolicy();

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
          </div>

          <ShippingPolicyForm
            baseFee={policy.baseFee}
            freeThreshold={policy.freeThreshold}
            remoteSurcharge={policy.remoteSurcharge}
          />
        </section>
      </div>
    </>
  );
}
