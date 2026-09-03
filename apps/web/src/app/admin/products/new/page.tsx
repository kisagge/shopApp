import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '~/lib/admin/guard';
import { getProductFormOptions } from '~/lib/admin/manage-product';
import { ProductForm } from '../product-form';

export const metadata: Metadata = { title: '상품 등록' };
export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  // 읽기가 아니라 쓰기 권한을 요구한다. 목록만 볼 수 있는 계정이
  // 등록 화면까지 들어오면 폼을 다 채운 뒤에야 거절당한다.
  const actor = await requireAdmin('product:write');
  const options = await getProductFormOptions(actor);

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
              <h1 className="text-[19px] font-semibold tracking-tight text-[var(--fg)]">상품 등록</h1>
            </li>
          </ol>
        </nav>
      </header>

      <div className="p-8">
        <div className="max-w-2xl rounded-md border border-[var(--border)] bg-[var(--bg)] p-7">
          {options.brands.length === 0 ? (
            <p className="text-[13px] text-[var(--fg-muted)]">
              등록할 수 있는 브랜드가 없습니다. 관리자에게 브랜드 배정을 요청해 주세요.
            </p>
          ) : (
            <ProductForm
              mode="create"
              brands={options.brands.map((b) => ({ id: b.id, label: b.name }))}
              categories={options.categories}
              initial={{
                slug: '', name: '', description: '',
                brandId: options.brands.length === 1 ? (options.brands[0]?.id ?? '') : '',
                categoryId: '', listPrice: '', salePrice: '', status: 'DRAFT',
              }}
            />
          )}
        </div>
        <p className="mt-3 max-w-2xl text-[11px] text-[var(--fg-muted)]">
          등록 직후에는 옵션이 없습니다. 저장한 뒤 상세 화면에서 재고를 넣어 주세요.
        </p>
      </div>
    </>
  );
}
