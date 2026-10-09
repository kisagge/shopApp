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
    /*
     * **말단 분류만 내려 준다** — 상품 폼과 같은 조건이다.
     *
     * 상품은 말단에만 붙고, 쿠폰 적용 판정은 상품의 분류와 **정확히 일치**할 때만 맞다고 본다
     * (core couponCoversProduct·장바구니 범위). 상위 분류를 고를 수 있게 두면 "아우터" 쿠폰이
     * 저장도 발급도 되는데 **어떤 상품에도 붙지 않는다** — 손님은 "쓸 수 없는 쿠폰" 만 보고
     * 운영은 까닭을 모른다. 오류도 경고도 없는 고장이라 고를 수 없게 하는 편이 낫다.
     */
    prisma.category.findMany({
      where: { children: { none: {} } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">쿠폰</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          발급 <span className="tnum">{coupons.length}</span>종
        </p>
      </header>
      <div className="p-8">
        <CouponBoard initial={coupons} brands={brands} categories={categories} />
      </div>
    </>
  );
}
