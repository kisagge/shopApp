import type { Metadata } from 'next';
import { canCreateBrand } from '@shop/core';
import { requireAdmin } from '~/lib/admin/guard';
import { listBrands } from '~/lib/admin/manage-brand';
import { BrandRowForm } from './brand-row-form';
import { NewBrandForm } from './new-brand-form';

export const metadata: Metadata = { title: '브랜드' };
export const dynamic = 'force-dynamic';

/**
 * 브랜드 관리.
 *
 * **시드 말고는 브랜드를 쓰는 곳이 없었다.** 그래서 입점 승인 때 자동으로 만들어진
 * 브랜드는 만들어진 그대로 굳었다 — 한글 이름이면 주소가 `brand-a1b2c3d4` 가
 * 되는데, 그 자리의 주석은 "나중에 가맹점이 직접 고칠 수 있다" 고 적어 두었지만
 * 고칠 자리가 없었다. 그 약속을 지키는 화면이다.
 *
 * 가맹점도 들어오되 **자기 브랜드만** 본다. 이름과 주소는 매대에 그대로 뜨는 값이라,
 * 남의 것을 고칠 수 있으면 그 가게의 간판을 바꿔 다는 셈이 된다.
 */
export default async function BrandsPage() {
  const actor = await requireAdmin('product:write');
  const brands = await listBrands(actor);
  const canCreate = canCreateBrand(actor);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <h1 className="text-[19px] font-semibold tracking-tight">브랜드 {brands.length}</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">
          이름과 주소는 매대에 그대로 뜹니다. 주소를 바꿔도 옛 주소는 새 주소로 넘어갑니다.
        </p>
      </header>

      <div className="flex flex-col gap-5 p-4 sm:p-8">
        {canCreate && <NewBrandForm />}

        {brands.length === 0 ? (
          <p className="rounded-md border border-[var(--border)] bg-[var(--bg)] py-16 text-center text-[13px] text-[var(--fg-muted)]">
            브랜드가 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {brands.map((b) => (
              <li
                key={b.id}
                className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-4 sm:p-6"
              >
                <BrandRowForm
                  brandId={b.id}
                  name={b.name}
                  slug={b.slug}
                  merchantName={b.merchantName}
                  productCount={b.productCount}
                  slugIsGenerated={b.slugIsGenerated}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
