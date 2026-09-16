import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { canEditBusinessInfo, canEditMerchantSettings, hasSettlementAccount } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getMerchantSettings } from '~/lib/admin/merchant-settings';
import { MerchantSettingsForm } from '~/components/admin/merchant-settings-form';
import { MerchantBusinessForm } from '~/components/admin/merchant-business-form';

export const metadata: Metadata = { title: '가맹점 정보' };
export const dynamic = 'force-dynamic';

/**
 * 가맹점 정보와 정산 계좌.
 *
 * 가맹점은 자기 것만 연다 — 남의 가맹점 id 를 치면 없는 화면으로 답한다(있는지조차 새지 않게). 사업자 정보 칸은
 * 운영진에게만 그린다: 화면에 그려 놓고 서버에서 거르면 그것대로 맞지만, 못 고치는 칸을 보여 주는 화면은 거짓말을 한다.
 */
export default async function MerchantSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin('merchant:read');
  const { id } = await params;
  if (!canEditMerchantSettings(actor, id)) notFound();

  const merchant = await getMerchantSettings(actor, id);
  const canEditBusiness = canEditBusinessInfo(actor);

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
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">
                {merchant.name} 정보
              </h1>
            </li>
          </ol>
        </nav>
      </header>

      <div className="flex flex-col gap-6 p-4 sm:p-8">
        <section
          aria-labelledby="settings-title"
          className="flex max-w-[560px] flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="settings-title" className="text-base font-semibold">연락처와 정산 계좌</h2>
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              정산이 확정되면 이 계좌로 지급합니다. 수수료율은 {merchant.commissionPercent}% 입니다.
            </p>
            {/* 없으면 지급 자체가 막힌다 — 등록하러 온 이유다 */}
            {!hasSettlementAccount(merchant) && (
              <p className="mt-1 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
                아직 정산 계좌가 없습니다. 등록하기 전에는 확정된 정산을 지급할 수 없습니다.
              </p>
            )}
          </div>
          <MerchantSettingsForm
            merchantId={merchant.id}
            businessName={merchant.businessName}
            initial={{
              contactEmail: merchant.contactEmail,
              contactPhone: merchant.contactPhone,
              settlementBank: merchant.settlementBank,
              settlementAccount: merchant.settlementAccount,
              settlementHolder: merchant.settlementHolder,
            }}
          />
        </section>

        <section
          aria-labelledby="business-title"
          className="flex max-w-[560px] flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-5 sm:p-6"
        >
          <div className="flex flex-col gap-1.5">
            <h2 id="business-title" className="text-base font-semibold">사업자 정보</h2>
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              정산과 세금계산서가 이 값을 근거로 삼습니다. 운영진만 고칠 수 있습니다.
            </p>
          </div>

          {canEditBusiness ? (
            <MerchantBusinessForm
              merchantId={merchant.id}
              initial={{
                name: merchant.name,
                businessName: merchant.businessName,
                businessNumber: merchant.businessNumber,
                representative: merchant.representative,
              }}
            />
          ) : (
            /*
             * 가맹점에게는 읽기로만 보여 준다. 감추면 무엇을 근거로 정산되는지 알 수 없고,
             * 고칠 수 있는 것처럼 그리면 화면이 거짓말을 한다.
             */
            <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-[var(--fg-muted)]">상호</dt>
              <dd>{merchant.businessName}</dd>
              <dt className="text-[var(--fg-muted)]">사업자등록번호</dt>
              <dd className="tnum">{merchant.businessNumber}</dd>
              <dt className="text-[var(--fg-muted)]">대표자</dt>
              <dd>{merchant.representative}</dd>
              <dt className="text-[var(--fg-muted)]">바꾸려면</dt>
              <dd className="text-[var(--fg-secondary)]">운영진에게 알려 주세요.</dd>
            </dl>
          )}
        </section>
      </div>
    </>
  );
}
