import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { getCategoryTree } from '~/lib/admin/manage-category';
import { CategoryTree } from './category-tree';

export const metadata: Metadata = { title: '카테고리' };
export const dynamic = 'force-dynamic';

/**
 * 카테고리 관리.
 *
 * **바꿀 창구가 없었다.** 매대의 카테고리 조회에 "창구가 없어서 거의 바뀌지 않는다"
 * 고 적혀 있다 — 캐시를 길게 잡아도 되는 이유로 적은 말이지만, 관리 화면이 없다는
 * 사실을 돌려 말한 것이기도 하다. 시즌마다 갈래를 더하려면 DB 콘솔을 열어야 했고,
 * 머리 메뉴의 순서도 시드만 썼다.
 *
 * 가맹점에게는 열지 않는다 — 카테고리는 매대 전체의 갈래라 누구의 것도 아니다.
 */
export default async function CategoriesPage() {
  const actor = await requireAdmin('product:write');
  const tree = await getCategoryTree(actor);

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <h1 className="text-[19px] font-semibold tracking-tight">카테고리</h1>
        <p className="max-w-[52ch] text-[13px] text-[var(--fg-muted)]">
          머리 메뉴가 이 순서로 섭니다. 두 단까지이고, 상품은 아래 갈래가 없는 곳에만 붙습니다.
        </p>
      </header>

      <div className="p-4 sm:p-8">
        <CategoryTree tree={tree} />
      </div>
    </>
  );
}
