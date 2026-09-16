import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@shop/ui';
import {
  format, discountRateOf, hasPermission,
  PRODUCT_STATUS_LABEL, isAwaitingReview, checkArchive, type ProductStatus,
} from '@shop/core';
import { ProductReview } from '~/components/admin/product-review';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminProducts } from '~/lib/queries/admin/products';
import { PageNav } from '~/components/page-nav';
import { PAGE_SIZE } from '~/lib/queries/admin/scope';
import { StockBulkActions } from './stock-bulk-actions';
import { RestoreProductButton } from './restore-button';
import { adminTimestamp } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '상품 관리' };
export const dynamic = 'force-dynamic';

// 라벨은 core 하나만 본다. 여기 따로 적어 두었더니 상태를 더할 때 이쪽이 남았다.
const STATUS_TONE: Record<string, 'success' | 'danger' | 'info' | 'neutral'> = {
  ACTIVE: 'success', SOLD_OUT: 'danger', PENDING_REVIEW: 'info',
  HIDDEN: 'neutral', DRAFT: 'neutral',
};

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; view?: string; archived?: string; restored?: string }>;
}) {
  const actor = await requireAdmin('product:read');
  const { page: pageParam, status, view, archived: justArchived, restored: justRestored } = await searchParams;
  const asked = Math.max(Number.parseInt(pageParam ?? '1', 10) || 1, 1);

  // 주소에 아무 값이나 들어올 수 있다. 아는 값만 필터로 쓴다.
  const archivedView = view === 'archived';
  const filter: ProductStatus | undefined = !archivedView && status === 'PENDING_REVIEW' ? status : undefined;

  const result = await getAdminProducts(actor, { page: asked, status: filter, archived: archivedView });
  const products = result.rows;
  const canWrite = hasPermission(actor, 'product:write');
  const canPublish = hasPermission(actor, 'product:publish');

  // 필터를 유지한 채 쪽을 넘긴다. 하나라도 빠뜨리면 넘기는 순간 조건이 풀린다
  const hrefOf = (n: number) => ({
    pathname: '/admin/products' as const,
    query: {
      ...(filter ? { status: filter } : {}),
      ...(archivedView ? { view: 'archived' } : {}),
      ...(n > 1 ? { page: String(n) } : {}),
    },
  });

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">상품 관리</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{result.total}</span>개
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

      <div className="flex flex-col gap-5 p-8">
        <StockBulkActions canWrite={canWrite} />

        <nav aria-label="상품 상태" className="flex gap-1 border-b border-[var(--border)]">
          {(['all', 'PENDING_REVIEW', 'archived'] as const).map((tab) => {
            const current = tab === 'archived' ? archivedView : tab === 'all' ? !archivedView && !filter : filter === tab;
            return (
              <Link
                key={tab}
                href={{
                  pathname: '/admin/products',
                  query: tab === 'archived' ? { view: 'archived' } : tab === 'all' ? {} : { status: tab },
                }}
                aria-current={current ? 'page' : undefined}
                className={`-mb-px border-b-2 px-4 py-2.5 text-[13px] no-underline ${
                  current
                    ? 'border-[var(--brand)] font-medium text-[var(--fg)]'
                    : 'border-transparent text-[var(--fg-secondary)] hover:text-[var(--fg)]'
                }`}
              >
                {tab === 'archived' ? '보관함' : tab === 'all' ? '전체' : '검수 대기'}
                {tab === 'PENDING_REVIEW' && result.awaitingReview > 0 && (
                  <span className="ml-1.5 text-accent">{result.awaitingReview}</span>
                )}
                {tab === 'archived' && result.archivedCount > 0 && (
                  <span className="tnum ml-1.5 text-[var(--fg-muted)]">{result.archivedCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* 보관·되돌리기가 끝나면 누른 단추가 사라진다 — 결과는 주소에 실려 와 여기서 말한다 */}
        {archivedView && justArchived === '1' && (
          <p role="status" className="rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
            상품을 보관했습니다. 매대·검색에서 빠졌고, 여기서 되돌릴 수 있습니다.
          </p>
        )}
        {archivedView && justRestored === '1' && (
          <p role="status" className="rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
            상품을 되돌렸습니다. 보관하기 전 상태로 돌아갔습니다.
          </p>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          {archivedView ? (
            products.length === 0 ? (
              <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">보관한 상품이 없습니다.</p>
            ) : (
              <div className="table-scroll" tabIndex={0} role="region" aria-label="보관한 상품 목록">
                <table>
                  <caption className="sr-only">보관한 상품 목록</caption>
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">상품</th>
                      <th scope="col" className="w-28 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">보관 전 상태</th>
                      <th scope="col" className="w-40 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">보관한 때</th>
                      <th scope="col" className="w-24 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">보관한 쪽</th>
                      {canWrite && (
                        <th scope="col" className="w-36 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">되돌리기</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => {
                      const restorable = checkArchive(actor, 'RESTORE', { deletedAt: p.archivedAt, archivedBy: p.archivedBy }) === null;
                      return (
                        <tr key={p.id} className="border-b border-[var(--surface-2)] last:border-0">
                          {/* 보관한 상품은 수정 화면이 없다 — 링크를 걸지 않는다 */}
                          <th scope="row" className="px-4 py-3 text-left font-normal">
                            <span className="block text-[13px]">{p.name}</span>
                            <span className="block text-[11px] text-[var(--fg-muted)]">{p.brandName}</span>
                          </th>
                          <td className="px-4 py-3 text-center">
                            <Badge tone="neutral">{PRODUCT_STATUS_LABEL[p.status as ProductStatus] ?? p.status}</Badge>
                          </td>
                          <td className="tnum px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                            {p.archivedAt && <time dateTime={p.archivedAt.toISOString()}>{adminTimestamp.format(p.archivedAt)}</time>}
                          </td>
                          <td className="px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                            {p.archivedBy === 'MERCHANT' ? '가맹점' : '운영진'}
                          </td>
                          {canWrite && (
                            <td className="px-4 py-3">
                              {restorable ? (
                                <RestoreProductButton productId={p.id} productName={p.name} />
                              ) : (
                                <span className="text-[11px] text-[var(--fg-muted)]">운영진에게 요청</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : products.length === 0 ? (
            <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
              {filter ? '검수를 기다리는 상품이 없습니다.' : '등록된 상품이 없습니다.'}
            </p>
          ) : (
            <div className="table-scroll" tabIndex={0} role="region" aria-label="등록된 상품 목록">
              <table>
                <caption className="sr-only">등록된 상품 목록</caption>
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">상품</th>
                    <th scope="col" className="w-36 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">카테고리</th>
                    <th scope="col" className="w-32 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">판매가</th>
                    <th scope="col" className="w-20 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">재고</th>
                    <th scope="col" className="w-24 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                    {canPublish && (
                      <th scope="col" className="w-56 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">검수</th>
                    )}
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
                          {/*
                            **기다리는 사람은 재고 옆에 붙는다.** 무엇을 먼저 채울지는
                            남은 수만 보고 정할 일이 아니다 — 0 개인 옵션 둘 중 하나는
                            열두 명이 기다리고 하나는 아무도 안 기다린다.
                          */}
                          {p.waitingRestock > 0 && (
                            <span className="tnum block text-[10px] text-warning">
                              {p.waitingRestock.toLocaleString('ko-KR')}명 대기
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>
                            {PRODUCT_STATUS_LABEL[p.status as ProductStatus] ?? p.status}
                          </Badge>
                        </td>
                        {canPublish && (
                          <td className="px-4 py-3">
                            {isAwaitingReview(p.status as ProductStatus) ? (
                              <ProductReview productId={p.id} productName={p.name} />
                            ) : (
                              <span className="text-[11px] text-[var(--fg-muted)]">
                                {p.publishRejection ? '반려함' : '—'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="mt-5">
          <PageNav page={asked} total={result.total} pageSize={PAGE_SIZE} hrefOf={hrefOf} />
        </div>
      </div>
    </>
  );
}
