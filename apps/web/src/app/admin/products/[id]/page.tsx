import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPermission } from '@shop/core';
import { PRODUCT_STATUS_LABEL, type ProductStatusInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminProductDetail } from '~/lib/queries/admin';
import { getProductFormOptions } from '~/lib/admin/manage-product';
import { ProductForm } from '../product-form';
import { StockForm } from '../stock-form';
import { VariantForm } from '../variant-form';

export const metadata: Metadata = { title: '상품 수정' };
export const dynamic = 'force-dynamic';

export default async function AdminProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireAdmin('product:read');
  const { id } = await params;

  const product = await getAdminProductDetail(actor, id);
  // 남의 브랜드 상품은 조회 단계에서 이미 걸러진다. 여기서 404 로 답하는 것은
  // "있지만 권한이 없다"를 알려 주지 않기 위해서다.
  if (!product) notFound();

  const canWrite = hasPermission(actor, 'product:write');
  const options = canWrite ? await getProductFormOptions(actor) : null;

  return (
    <>
      <header className="flex h-17 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <nav aria-label="현재 위치">
          <ol className="flex items-center gap-2 text-[13px] text-[var(--fg-muted)]">
            <li>
              <Link href="/admin/products" className="no-underline hover:underline">상품 관리</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">
                {product.name}
              </h1>
            </li>
          </ol>
        </nav>
      </header>

      <main className="grid gap-6 p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section aria-labelledby="product-edit" className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-7">
          <h2 id="product-edit" className="sr-only">상품 정보 수정</h2>
          {canWrite && options ? (
            <ProductForm
              mode="edit"
              productId={product.id}
              brands={options.brands.map((b) => ({ id: b.id, label: b.name }))}
              categories={options.categories}
              initial={{
                slug: product.slug,
                name: product.name,
                description: product.description,
                brandId: product.brandId,
                categoryId: product.categoryId,
                listPrice: String(product.listPrice),
                salePrice: product.salePrice === null ? '' : String(product.salePrice),
                status: product.status as ProductStatusInput,
              }}
            />
          ) : (
            <dl className="grid grid-cols-[120px_1fr] gap-y-3 text-[13px]">
              <dt className="text-[var(--fg-muted)]">브랜드</dt>
              <dd>{product.brandName}</dd>
              <dt className="text-[var(--fg-muted)]">카테고리</dt>
              <dd>{product.categoryName}</dd>
              <dt className="text-[var(--fg-muted)]">상태</dt>
              <dd>{PRODUCT_STATUS_LABEL[product.status as ProductStatusInput] ?? product.status}</dd>
            </dl>
          )}
        </section>

        <section
          aria-labelledby="product-stock"
          className="flex h-fit flex-col gap-7 rounded-md border border-[var(--border)] bg-[var(--bg)] p-7"
        >
          <h2 id="product-stock" className="text-[15px] font-semibold tracking-tight">재고</h2>

          {product.variants.length === 0 ? (
            <p className="text-[13px] text-warning">
              옵션이 없어 판매할 수 없습니다. 아래에서 옵션을 하나 이상 추가해 주세요.
            </p>
          ) : canWrite ? (
            <StockForm productId={product.id} variants={product.variants} />
          ) : (
            <ul className="flex flex-col gap-2 text-[13px]">
              {product.variants.map((v) => (
                <li key={v.id} className="flex justify-between">
                  <span>{v.optionLabel}</span>
                  <span className="tnum">{v.stock}</span>
                </li>
              ))}
            </ul>
          )}

          {canWrite && (
            <div className="border-t border-[var(--surface-2)] pt-6">
              <VariantForm productId={product.id} />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
