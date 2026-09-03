import type { Metadata } from 'next';
import { prisma } from '@shop/db';
import { requireAdmin } from '~/lib/admin/guard';
import { listCoupons } from '~/lib/admin/manage-coupon';
import { CouponBoard } from './coupon-board';

export const metadata: Metadata = { title: '쿠폰 관리' };
export const dynamic = 'force-dynamic';

export default async function AdminCouponsPage() {
  const actor = await requireAdmin('coupon:read');
  const [coupons, brands, categories] = await Promise.all([
    listCoupons(actor),
    // 대상 지정에 쓸 목록. 브랜드·카테고리는 수가 적어 통째로 내려도 된다.
    prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">쿠폰</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          발급 <span className="tnum">{coupons.length}</span>종
        </p>
      </header>
      <main className="p-8">
        <CouponBoard initial={coupons} brands={brands} categories={categories} />
      </main>
    </>
  );
}
