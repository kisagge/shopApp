import {
  PRODUCT_SORT, FACET_KEYS, hasFacets, EMPTY_FACETS,
  type ProductSort, type Facets, type FacetKey,
} from '@shop/core';
import type { MessageKey } from '@shop/i18n';
import { getT } from '~/lib/i18n/server';

/**
 * 정렬 이름은 core 가 아니라 여기서 고른다.
 *
 * core 는 어느 말로 보여 줄지 모르는 순수한 규칙 묶음이다 — 거기에 언어를
 * 들이면 정책과 화면이 섞인다. core 는 정렬 종류만 정하고, 그것을 뭐라고
 * 부를지는 화면이 정한다.
 */
/** 축 이름도 core 가 아니라 화면이 정한다 — 정렬 이름과 같은 이유다. */
const FACET_LABEL: Record<FacetKey, MessageKey> = {
  color: 'catalog.color',
  size: 'catalog.size',
};

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
  facets = EMPTY_FACETS,
  selected = { color: [], size: [] },
}: {
  /** 폼이 되돌아갈 경로 */
  action: string;
  sort: ProductSort;
  minPrice?: number | undefined;
  maxPrice?: number | undefined;
  /** 검색 페이지에서 검색어를 유지하기 위한 값 */
  query?: string | undefined;
  total: number | null;
  /** 지금 범위에서 고를 수 있는 값. 없으면 이 자리를 그리지 않는다. */
  facets?: Facets;
  selected?: Readonly<Record<FacetKey, readonly string[]>>;
}) {
  const t = await getT();
  const filtered =
    minPrice !== undefined ||
    maxPrice !== undefined ||
    FACET_KEYS.some((key) => selected[key].length > 0);

  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border)] pb-5"
    >
      {/* 검색어는 정렬을 바꿔도 유지돼야 한다 */}
      {query && <input type="hidden" name="q" value={query} />}

      {/*
        색상·사이즈.
        **체크박스다.** 같은 이름으로 여러 개가 주소에 붙는 것이 그대로
        `?size=M&size=L` 이 되고, 자바스크립트 없이도 동작한다. 칩처럼
        보이지만 실제로는 label 안의 체크박스라 키보드와 낭독기가 그대로
        읽는다 — 눈에만 보이는 버튼으로 만들면 그것을 다시 만들어야 한다.
      */}
      {hasFacets(facets) && (
        <div className="flex w-full flex-col gap-3">
          {FACET_KEYS.filter((key) => facets[key].length > 0).map((key) => (
            <fieldset key={key} className="flex flex-wrap items-center gap-2 border-0 p-0">
              <legend className="float-left mr-3 text-[11px] text-[var(--fg-muted)]">
                {t(FACET_LABEL[key])}
              </legend>
              {facets[key].map((option) => (
                <label
                  key={option.value}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-n-300 px-2.5 py-1.5 text-[12px] has-[:checked]:border-n-900 has-[:checked]:bg-n-900 has-[:checked]:text-n-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                >
                  <input
                    type="checkbox"
                    name={key}
                    value={option.value}
                    defaultChecked={selected[key].includes(option.value)}
                    className="sr-only"
                  />
                  {option.swatchHex && (
                    <span
                      aria-hidden="true"
                      className="size-3 rounded-full border border-n-300"
                      style={{ backgroundColor: option.swatchHex }}
                    />
                  )}
                  {option.value}
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      )}

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
            {t('catalog.resetFilters')}
          </a>
        )}
      </div>
    </form>
  );
}
