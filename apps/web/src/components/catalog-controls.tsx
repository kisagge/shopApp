import { PRODUCT_SORT, type ProductSort } from '@shop/core';
import type { MessageKey } from '@shop/i18n';
import { getT } from '~/lib/i18n/server';

/**
 * 정렬 이름은 core 가 아니라 여기서 고른다.
 *
 * core 는 어느 말로 보여 줄지 모르는 순수한 규칙 묶음이다 — 거기에 언어를
 * 들이면 정책과 화면이 섞인다. core 는 정렬 종류만 정하고, 그것을 뭐라고
 * 부를지는 화면이 정한다.
 */
const SORT_KEY: Record<ProductSort, MessageKey> = {
  recommended: 'catalog.sortRecommended',
  newest: 'catalog.sortNewest',
  price_asc: 'catalog.sortPriceAsc',
  price_desc: 'catalog.sortPriceDesc',
  rating: 'catalog.sortRating',
};

/**
 * 정렬·가격 필터.
 *
 * GET 폼이다. 조건이 주소에 남아야 공유하고 뒤로 갈 수 있고, 자바스크립트가
 * 없어도 동작한다. 목록은 서버가 그리므로 클라이언트 상태를 둘 이유가 없다.
 */
export async function CatalogControls({
  action,
  sort,
  minPrice,
  maxPrice,
  query,
  total,
}: {
  /** 폼이 되돌아갈 경로 */
  action: string;
  sort: ProductSort;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  /** 검색 페이지에서 검색어를 유지하기 위한 값 */
  query?: string | undefined;
  total: number | null;
}) {
  const t = await getT();
  const filtered = minPrice !== undefined || maxPrice !== undefined;

  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border)] pb-5"
    >
      {/* 검색어는 정렬을 바꿔도 유지돼야 한다 */}
      {query && <input type="hidden" name="q" value={query} />}

      <p className="text-[13px] text-[var(--fg-secondary)]">
        {total === null ? (
          ' '
        ) : (
          <span className="tnum font-semibold text-[var(--fg)]">
            {t('catalog.totalCount', { count: total })}
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex items-end gap-2 border-0 p-0">
          <legend className="sr-only">{t('catalog.priceRange')}</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="minPrice" className="text-[11px] text-[var(--fg-muted)]">
              {t('catalog.minPrice')}
            </label>
            <input
              id="minPrice" name="minPrice" type="number" inputMode="numeric"
              min={0} step={1000} defaultValue={minPrice ?? ''} placeholder="0"
              className="tnum h-10 w-28 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
            />
          </div>
          <span aria-hidden="true" className="pb-2.5 text-[var(--fg-muted)]">–</span>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="maxPrice" className="text-[11px] text-[var(--fg-muted)]">
              {t('catalog.maxPrice')}
            </label>
            <input
              id="maxPrice" name="maxPrice" type="number" inputMode="numeric"
              min={0} step={1000} defaultValue={maxPrice ?? ''} placeholder={t('catalog.noLimit')}
              className="tnum h-10 w-28 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort" className="text-[11px] text-[var(--fg-muted)]">
            {t('catalog.sort')}
          </label>
          <select
            id="sort" name="sort" defaultValue={sort}
            className="h-10 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
          >
            {PRODUCT_SORT.map((s) => (
              <option key={s} value={s}>
                {t(SORT_KEY[s])}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
        >
          {t('catalog.apply')}
        </button>

        {filtered && (
          <a
            href={query ? `${action}?q=${encodeURIComponent(query)}` : action}
            className="flex h-10 items-center px-1 text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
          >
            {t('catalog.resetPrice')}
          </a>
        )}
      </div>
    </form>
  );
}
