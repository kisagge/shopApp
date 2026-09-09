import type { Metadata } from 'next';
import {
  COMPARE_ROW, COMPARE_ERROR, MAX_COMPARE,
  compareError, differingRows, bestInRow,
  type CompareRow,
} from '@shop/core';
import { formatMoney, type Locale } from '@shop/i18n';
import { getComparableProducts, type CompareItem } from '~/lib/queries/catalog/compare';
import { getLocale, getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';
import { AppLink } from '~/components/app-link';
import { AppImage } from '~/components/app-image';

/**
 * 상품 비교.
 *
 * **주소가 곧 비교표다.** 담아 둔 것은 기기에만 있지만 이 화면은 주소의
 * slug 목록으로 그린다 — 그래야 링크를 보낼 수 있고, 서버에서 그릴 수 있고,
 * 뒤로 가기가 예상대로 움직인다.
 *
 * 색인하지 않는다. 조합이 무한한 주소라 색인해 봐야 같은 상품이 수백 벌로
 * 도는 것과 같다.
 */
export const metadata: Metadata = NO_INDEX;
export const dynamic = 'force-dynamic';

/** 표 한 칸의 폭. 이보다 좁으면 상품명이 두 줄을 넘어간다. */
const COLUMN = 'min-w-[168px]';

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ slugs?: string }>;
}) {
  const [{ slugs: raw }, t, locale] = await Promise.all([searchParams, getT(), getLocale()]);

  /*
   * 주소는 사람이 고칠 수 있다. 중복을 걷고 상한만큼만 자른다 — 백 개를
   * 적어 보낸 주소로 백 개를 읽지 않는다.
   */
  const slugs = [...new Set((raw ?? '').split(',').filter(Boolean))].slice(0, MAX_COMPARE);
  const products = await getComparableProducts(slugs);
  const error = compareError(products);

  if (error !== null) {
    return (
      <Shell t={t}>
        <p className="text-sm text-[var(--fg-secondary)]">
          {error === COMPARE_ERROR.TOO_FEW
            ? t('compare.tooFew')
            : error === COMPARE_ERROR.TOO_MANY
              ? t('compare.tooMany', { max: MAX_COMPARE })
              : t('compare.mixedCategory')}
        </p>
      </Shell>
    );
  }

  const differing = differingRows(products);
  const same = COMPARE_ROW.filter((row) => !differing.includes(row));

  return (
    <Shell t={t}>
      <p className="text-sm text-[var(--fg-secondary)]">
        {t('compare.lead', { count: products.length })}
      </p>
      {/* 담아 둔 것 중 내려간 상품이 있으면 조용히 빠지므로, 빠졌다고 말해 준다 */}
      {products.length < slugs.length && (
        <p className="text-xs text-[var(--fg-muted)]">{t('compare.gone')}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            {t('compare.lead', { count: products.length })}
          </caption>
          <thead>
            <tr>
              {/* 빈 모서리 칸. 아래 줄 제목들의 열 머리다 */}
              <th scope="col" className="w-28 border-b border-[var(--border)] p-2 text-left text-xs font-normal text-[var(--fg-muted)]">
                <span className="sr-only">{t('compare.heading')}</span>
              </th>
              {products.map((p) => (
                <th
                  key={p.slug}
                  scope="col"
                  className={`border-b border-[var(--border)] p-2 text-left align-top ${COLUMN}`}
                >
                  <AppLink href={`/product/${p.slug}`} className="flex flex-col gap-2 no-underline">
                    <span className="relative flex aspect-4/5 items-center justify-center overflow-hidden rounded-sm bg-[var(--surface-2)]">
                      {p.imageUrl && (
                        <AppImage
                          src={p.imageUrl}
                          alt={p.imageAlt ?? ''}
                          sizes="(min-width: 1024px) 220px, 45vw"
                          {...(p.blurDataUrl ? { blurDataUrl: p.blurDataUrl } : {})}
                          className="object-cover"
                        />
                      )}
                    </span>
                    <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{p.brand}</span>
                    <span className="text-xs leading-snug font-normal text-[var(--fg)]">{p.name}</span>
                  </AppLink>
                </th>
              ))}
            </tr>
          </thead>

          {/*
            **다른 줄을 먼저 둔다.** 같은 줄이 위에 있으면 사람이 같은 값을
            네 번 읽고 나서야 다른 곳에 닿는다. 같은 줄도 지우지는 않는다 —
            같다는 사실을 알아야 하는 사람이 있다.
          */}
          <tbody>
            {differing.map((row) => (
              <Row key={row} row={row} products={products} t={t} locale={locale} highlight />
            ))}
          </tbody>
          {same.length > 0 && (
            <tbody className="border-t-4 border-[var(--surface-2)]">
              <tr>
                <th
                  scope="colgroup"
                  colSpan={products.length + 1}
                  className="p-2 text-left text-[11px] font-normal text-[var(--fg-muted)]"
                >
                  {t('compare.same', { count: same.length })}
                </th>
              </tr>
              {same.map((row) => (
                <Row key={row} row={row} products={products} t={t} locale={locale} highlight={false} />
              ))}
            </tbody>
          )}
        </table>
      </div>
    </Shell>
  );
}

function Shell({ t, children }: { t: Awaited<ReturnType<typeof getT>>; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-10">
      <h1 className="font-serif text-2xl font-medium tracking-tight">{t('compare.heading')}</h1>
      {children}
    </div>
  );
}

function Row({
  row, products, t, locale, highlight,
}: {
  row: CompareRow;
  products: readonly CompareItem[];
  t: Awaited<ReturnType<typeof getT>>;
  locale: Locale;
  highlight: boolean;
}) {
  const best = highlight ? bestInRow(row, products) : [];

  return (
    <tr className="border-b border-[var(--border)]">
      <th scope="row" className="p-2 text-left align-top text-xs font-normal text-[var(--fg-muted)]">
        {t(`compare.row.${row}` as 'compare.row.price')}
      </th>
      {products.map((p) => {
        const isBest = best.includes(p.slug);
        return (
          <td key={p.slug} className={`p-2 align-top ${isBest ? 'font-semibold text-[var(--fg)]' : 'text-[var(--fg-secondary)]'}`}>
            <Cell row={row} product={p} t={t} locale={locale} />
            {/* 굵은 글씨만으로는 무엇이 나은지 낭독기에 전해지지 않는다 */}
            {isBest && <span className="sr-only"> — {t('compare.best')}</span>}
          </td>
        );
      })}
    </tr>
  );
}

function Cell({
  row, product, t, locale,
}: {
  row: CompareRow;
  product: CompareItem;
  t: Awaited<ReturnType<typeof getT>>;
  locale: Locale;
}) {
  switch (row) {
    case 'price':
      return <span className="tnum">{formatMoney(locale, product.price)}</span>;
    case 'discount':
      return (
        <span className="tnum">
          {product.discountPercent === undefined ? t('compare.noDiscount') : `${product.discountPercent}%`}
        </span>
      );
    case 'rating':
      return (
        <span className="tnum">
          {product.rating === undefined ? t('compare.noRating') : product.rating.toFixed(1)}
        </span>
      );
    case 'reviewCount':
      return <span className="tnum">{product.reviewCount}</span>;
    case 'stock':
      return <span>{product.soldOut ? t('compare.outOfStock') : t('compare.inStock')}</span>;
    case 'brand':
      return <span>{product.brand}</span>;
    case 'shipping':
      return <span>{product.freeShipping ? t('compare.freeShipping') : t('compare.paidShipping')}</span>;
    case 'options':
      return (
        <ul className="flex flex-col gap-0.5">
          {Object.entries(product.options).map(([name, values]) => (
            <li key={name} className="text-xs">
              <span className="text-[var(--fg-muted)]">{name}</span> {values.join(' · ')}
            </li>
          ))}
        </ul>
      );
  }
}
