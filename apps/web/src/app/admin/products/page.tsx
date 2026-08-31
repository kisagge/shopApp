import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@shop/ui';
import { format, discountRateOf, hasPermission } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminProducts } from '~/lib/queries/admin';
import { Pager } from '../pager';

export const metadata: Metadata = { title: '상품 관리' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: '작성 중', ACTIVE: '판매중', SOLD_OUT: '품절', HIDDEN: '숨김',
};
const STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  ACTIVE: 'success', SOLD_OUT: 'danger', HIDDEN: 'neutral', DRAFT: 'neutral',
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const actor = await requireAdmin('product:read');
  const { cursor } = await searchParams;
  const page = await getAdminProducts(actor, { cursor });
  const products = page.rows;
  const canWrite = hasPermission(actor, 'product:write');

  const nextHref = page.nextCursor
    ? { pathname: '/admin/products' as const, query: { cursor: page.nextCursor } }
    : null;

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">상품 관리</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{page.total}</span>개
            {actor.merchantId && ' · 내 브랜드만'}
          </p>
        </div>

        {canWrite && (
          <Link
            href="/admin/products/new"
            className="inline-flex h-10 items-center rounded-sm bg-[var(--brand)] px-4 text-sm font-medium text-[var(--bg)] no-underline hover:bg-[var(--brand-hover)]"
          >
            상품 등록
          </Link>
        )}
      </header>

      <main className="p-8">
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {products.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              등록된 상품이 없습니다.
            </p>
          ) : (
            <table>
              <caption className="sr-only">등록된 상품 목록</caption>
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th scope="col" className="px-4 py-3 text-xs text-[var(--fg-secondary)]">상품</th>
                  <th scope="col" className="w-36 px-4 py-3 text-xs text-[var(--fg-secondary)]">카테고리</th>
                  <th scope="col" className="w-32 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">판매가</th>
                  <th scope="col" className="w-20 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">재고</th>
                  <th scope="col" className="w-24 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const price = p.salePrice ?? p.listPrice;
                  const rate = p.salePrice === null ? 0 : discountRateOf(p.listPrice, p.salePrice);
                  return (
                    <tr key={p.id} className="border-b border-[var(--surface-2)] last:border-0">
                      <td className="px-4 py-3">
                        {/* 행 전체를 클릭 영역으로 만들지 않는다. 링크는 링크로
                            보여야 키보드 사용자가 순서대로 짚어 갈 수 있다. */}
                        <Link
                          href={`/admin/products/${p.id}`}
                          className="block text-[13px] text-[var(--fg)] no-underline hover:underline"
                        >
                          {p.name}
                        </Link>
                        <span className="block text-[11px] text-[var(--fg-muted)]">{p.brandName}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--fg-secondary)]">{p.categoryName}</td>
                      <td className="px-4 py-3 text-right">
                        {rate > 0 && (
                          <span className="tnum block text-[11px] text-[var(--fg-muted)] line-through">
                            {format(p.listPrice)}
                          </span>
                        )}
                        <span className="tnum text-[13px] font-semibold">{format(price)}</span>
                        {rate > 0 && <span className="tnum ml-1 text-[11px] text-accent">{rate}%</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`tnum text-[13px] font-semibold ${
                            p.totalStock === 0 ? 'text-accent' : p.lowStock ? 'text-warning' : ''
                          }`}
                        >
                          {p.totalStock}
                        </span>
                        {/* 재고 경고를 색으로만 알리지 않는다 */}
                        {p.totalStock > 0 && p.lowStock && (
                          <span className="block text-[10px] text-warning">임박</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="mt-5">
          <Pager href={nextHref} label="이전 상품 더 보기" hasRows={products.length > 0} />
        </div>
      </main>
    </>
  );
}
