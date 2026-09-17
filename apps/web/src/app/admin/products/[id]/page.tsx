import Image from 'next/image';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hasPermission } from '@shop/core';
import { PRODUCT_STATUS_LABEL, type ProductStatusInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminProductDetail } from '~/lib/queries/admin/products';
import { getProductFormOptions } from '~/lib/admin/manage-product';
import { listProductImages } from '~/lib/admin/manage-images';
import { isStorageConfigured } from '~/lib/storage';
import { ProductForm } from '../product-form';
import { StockForm } from '../stock-form';
import { VariantForm } from '../variant-form';
import { ImageManager } from '../image-manager';
import { DuplicateProductButton } from '../duplicate-button';
import { ArchiveProductButton } from '../archive-button';
import { countUnshippedLines } from '~/lib/admin/archive-product';

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
  const [options, images, unshipped] = await Promise.all([
    canWrite ? getProductFormOptions(actor) : Promise.resolve(null),
    listProductImages(product.id),
    canWrite ? countUnshippedLines(product.id) : Promise.resolve(0),
  ]);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
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
        {canWrite && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <DuplicateProductButton productId={product.id} />
            <ArchiveProductButton productId={product.id} unshipped={unshipped} />
          </div>
        )}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 p-4 sm:p-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section
          aria-labelledby="product-edit"
          className="h-fit rounded-md border border-[var(--border)] bg-[var(--bg)] p-7 xl:col-start-1 xl:row-span-2 xl:row-start-1"
        >
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
              canPublish={hasPermission(actor, 'product:publish')}
              rejection={product.publishRejection}
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
          aria-labelledby="product-images"
          className="flex h-fit flex-col gap-5 rounded-md border border-[var(--border)] bg-[var(--bg)] p-7 xl:col-start-2 xl:row-start-1"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="product-images" className="text-[15px] font-semibold tracking-tight">이미지</h2>
            <p className="text-[11px] text-[var(--fg-muted)]">
              첫 장이 목록 대표 이미지
            </p>
          </div>

          {canWrite ? (
            <ImageManager
              productId={product.id}
              initial={images}
              storageConfigured={isStorageConfigured()}
            />
          ) : images.length === 0 ? (
            <p className="text-[13px] text-[var(--fg-muted)]">등록된 이미지가 없습니다.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {images.map((i) => (
                <li key={i.id}>
                  <Image
                    src={i.url}
                    alt={i.alt}
                    width={72}
                    height={90}
                    className="h-[90px] w-[72px] rounded-xs bg-[var(--surface-2)] object-cover"
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="product-stock"
          className="flex h-fit flex-col gap-7 rounded-md border border-[var(--border)] bg-[var(--bg)] p-7 xl:col-start-2 xl:row-start-2"
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
                <li key={v.id} className="flex justify-between gap-3">
                  <span>{v.optionLabel}</span>
                  <span className="flex gap-3">
                    {v.waitingRestock > 0 && (
                      <span className="tnum text-[11px] text-warning">
                        {v.waitingRestock.toLocaleString('ko-KR')}명 대기
                      </span>
                    )}
                    <span className="tnum">{v.stock}</span>
                  </span>
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
      </div>
    </>
  );
}
