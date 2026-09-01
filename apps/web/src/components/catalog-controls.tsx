import { PRODUCT_SORT, PRODUCT_SORT_LABEL, type ProductSort } from '@shop/core';

/**
 * 정렬·가격 필터.
 *
 * GET 폼이다. 조건이 주소에 남아야 공유하고 뒤로 갈 수 있고, 자바스크립트가
 * 없어도 동작한다. 목록은 서버가 그리므로 클라이언트 상태를 둘 이유가 없다.
 */
export function CatalogControls({
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
          <>
            총 <span className="tnum font-semibold text-[var(--fg)]">{total.toLocaleString('ko-KR')}</span>개
          </>
        )}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <fieldset className="flex items-end gap-2 border-0 p-0">
          <legend className="sr-only">가격 범위</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="minPrice" className="text-[11px] text-[var(--fg-muted)]">
              최소 가격
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
              최대 가격
            </label>
            <input
              id="maxPrice" name="maxPrice" type="number" inputMode="numeric"
              min={0} step={1000} defaultValue={maxPrice ?? ''} placeholder="제한 없음"
              className="tnum h-10 w-28 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sort" className="text-[11px] text-[var(--fg-muted)]">정렬</label>
          <select
            id="sort" name="sort" defaultValue={sort}
            className="h-10 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
          >
            {PRODUCT_SORT.map((s) => (
              <option key={s} value={s}>{PRODUCT_SORT_LABEL[s]}</option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)]"
        >
          적용
        </button>

        {filtered && (
          <a
            href={query ? `${action}?q=${encodeURIComponent(query)}` : action}
            className="flex h-10 items-center px-1 text-[13px] text-[var(--fg-secondary)] no-underline hover:underline"
          >
            가격 초기화
          </a>
        )}
      </div>
    </form>
  );
}
