import {
  PRODUCT_SORT, FACET_KEYS, hasFacets, EMPTY_FACETS, PRICE_BUCKET,
  type ProductSort, type Facets, type FacetKey,
} from '@shop/core';
import { formatMoneyCompact } from '@shop/i18n';
import type { MessageKey } from '@shop/i18n';
import { getT, getLocale } from '~/lib/i18n/server';
import type { BrandOption } from '~/lib/queries/catalog/search';

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
  brands = [],
  selectedBrands = [],
  priceBucket = null,
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
  /**
   * 고를 수 있는 브랜드. 비어 있으면 이 축을 그리지 않는다.
   *
   * **브랜드 화면에서는 주지 않는다** — 거기서는 브랜드가 이미 주소로
   * 정해져 있어서, 그 안에서 또 고르는 것은 뜻이 없다.
   */
  brands?: readonly BrandOption[];
  selectedBrands?: readonly string[];
  /**
   * 눌린 가격 구간. 손으로 숫자를 친 경우에는 null 이다 —
   * 어느 쪽이 이기는지는 core 의 resolvePriceRange 가 정한다.
   *
   * **minPrice·maxPrice 에는 사람이 친 값이 온다.** 구간에서 편 경계를
   * 되돌려 주면 안 된다 — 199,999 같은 속값이 칸에 채워지고, 다음에 적용을
   * 누르면 그 값이 구간을 이겨 화면이 제 꼬리를 문다.
   */
  priceBucket?: string | null;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const activeCount =
    (minPrice !== undefined ? 1 : 0) +
    (maxPrice !== undefined ? 1 : 0) +
    (priceBucket === null ? 0 : 1) +
    selectedBrands.length +
    FACET_KEYS.reduce((n, key) => n + selected[key].length, 0);
  const filtered = activeCount > 0;

  return (
    <form
      method="get"
      action={action}
      className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 border-b border-[var(--border)] pb-5"
    >
      {/* 검색어는 정렬을 바꿔도 유지돼야 한다 */}
      {query && <input type="hidden" name="q" value={query} />}

      {/*
        **접어 둔다.** 상품이 여덟일 때는 색이 서넛이라 한 줄이었다. 서른넷이
        되면서 아우터 한 곳에만 색이 열둘 — 375px 화면에서 칩만 네 줄이고,
        옷은 접힌 곳 아래로 밀렸다. 옷 가게를 열었는데 옷이 안 보인다.

        details 를 쓴다. 여닫는 데 자바스크립트가 필요 없고, summary 는
        그 자체로 aria-expanded 를 가진 단추라 낭독기가 그대로 읽는다.
        직접 만들면 그 둘을 다시 만들어야 한다.

        접혀 있어도 안의 체크박스는 폼과 함께 넘어간다 — disabled 가 아니기
        때문이다. 그래서 접은 채로 정렬만 바꿔도 조건이 풀리지 않는다.
      */}
      <details open={filtered} className="group w-full">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden="true"
            className="text-[10px] text-[var(--fg-muted)] transition-transform group-open:rotate-90"
          >
            &#9654;
          </span>
          {t('catalog.filters')}
          {activeCount > 0 && (
            <span className="tnum rounded-full bg-n-900 px-2 py-0.5 text-[11px] font-normal text-n-0">
              {t('catalog.filterCount', { count: activeCount })}
            </span>
          )}
        </summary>

        <div className="flex flex-col gap-4 pt-4">
          {/*
            색상·사이즈는 **체크박스다.** 같은 이름으로 여러 개가 주소에
            붙는 것이 그대로 `?size=M&size=L` 이 되고, 자바스크립트 없이도
            동작한다. 칩처럼 보이지만 실제로는 label 안의 체크박스라 키보드와
            낭독기가 그대로 읽는다 — 눈에만 보이는 버튼으로 만들면 그것을
            다시 만들어야 한다.
          */}
          {/*
            브랜드를 색·사이즈보다 위에 둔다. 옷을 고를 때 먼저 좁히는 것이
            보통 만든 곳이고, 색과 사이즈는 그 안에서 고르는 값이다.
          */}
          {brands.length > 0 && (
            <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
              <legend className="float-left mr-3 text-[11px] text-[var(--fg-muted)]">
                {t('catalog.brand')}
              </legend>
              {brands.map((brand) => (
                <label
                  key={brand.slug}
                  className="inline-flex cursor-pointer items-center rounded-sm border border-n-300 px-2.5 py-1.5 text-[12px] has-[:checked]:border-n-900 has-[:checked]:bg-n-900 has-[:checked]:text-n-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                >
                  <input
                    type="checkbox"
                    name="brand"
                    value={brand.slug}
                    defaultChecked={selectedBrands.includes(brand.slug)}
                    className="sr-only"
                  />
                  {brand.name}
                </label>
              ))}
            </fieldset>
          )}

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

          <fieldset className="flex flex-wrap items-end gap-2 border-0 p-0">
            <legend className="float-left mr-3 text-[11px] text-[var(--fg-muted)]">
              {t('catalog.priceRange')}
            </legend>

            {/*
              **자주 하는 일을 한 번으로.** 숫자 두 칸만 두면 "10만원 아래로
              보고 싶다" 는 흔한 일이 칸 찾기·타이핑·적용 세 걸음이었다.

              라디오라 하나만 고를 수 있다. 구간이 서로 겹치지 않으므로
              여럿을 고르는 것이 뜻이 없고, 겹치지 않는다는 것은 core 의
              검사가 지킨다.
            */}
            <div className="flex w-full flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-sm border border-n-300 px-2.5 py-1.5 text-[12px] has-[:checked]:border-n-900 has-[:checked]:bg-n-900 has-[:checked]:text-n-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
                <input
                  type="radio"
                  name="price"
                  value=""
                  defaultChecked={priceBucket === null}
                  className="sr-only"
                />
                {t('catalog.priceAny')}
              </label>
              {PRICE_BUCKET.map((bucket, i) => {
                /*
                 * 칸의 끝은 99,999 처럼 하나 모자란 값이다. 그 숫자를 그대로
                 * 보여 주면 읽는 사람이 셈을 하게 되므로, 이웃 칸이 시작하는
                 * 둥근 값으로 말한다 — `10만원 이하`.
                 */
                const edge = PRICE_BUCKET[i + 1]?.min ?? null;
                const money = (won: number) => formatMoneyCompact(locale, won);
                const label =
                  bucket.min === null
                    ? t('catalog.priceUnder', { max: money(edge!) })
                    : edge === null
                      ? t('catalog.priceOver', { min: money(bucket.min) })
                      : t('catalog.priceBetween', { min: money(bucket.min), max: money(edge) });

                return (
                  <label
                    key={bucket.id}
                    className="inline-flex cursor-pointer items-center rounded-sm border border-n-300 px-2.5 py-1.5 text-[12px] has-[:checked]:border-n-900 has-[:checked]:bg-n-900 has-[:checked]:text-n-0 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
                  >
                    <input
                      type="radio"
                      name="price"
                      value={bucket.id}
                      defaultChecked={priceBucket === bucket.id}
                      className="sr-only"
                    />
                    {label}
                  </label>
                );
              })}
            </div>
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
        </div>
      </details>

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
