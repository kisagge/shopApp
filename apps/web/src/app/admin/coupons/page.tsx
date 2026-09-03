import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { listCoupons } from '~/lib/admin/manage-coupon';
import { CouponBoard } from './coupon-board';

export const metadata: Metadata = { title: '쿠폰 관리' };
export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const actor = await requireAdmin('coupon:read');
  const coupons = await listCoupons(actor);

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">쿠폰</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          발급 <span className="tnum">{coupons.length}</span>종
        </p>
      </header>
      <main className="p-8">
        <CouponBoard initial={coupons} />
      </main>
    </>
  );
}
