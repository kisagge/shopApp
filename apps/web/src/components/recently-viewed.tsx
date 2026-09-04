'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ProductCard } from '@shop/ui';
import type { ProductListItem } from '~/lib/queries/products';
import { useRecentlyViewed } from '~/stores/recently-viewed';
import { useLocale, useT } from '~/lib/i18n/client';
import { AppLink } from './app-link';
import { AppImage } from './app-image';

/** 한 줄에 그릴 최대 개수. 들고 있는 것보다 적게 보여도 된다. */
const SHOWN = 8;

/** 가로 한 칸의 폭에 맞춘 표시 크기. 이 값이 어긋나면 최적화가 헛돈다. */
const IMAGE_SIZES = '(min-width: 768px) 200px, 160px';

async function fetchRecent(slugs: readonly string[]): Promise<ProductListItem[]> {
  const params = new URLSearchParams({ slugs: slugs.join(',') });
  const res = await fetch(`/api/products/recent?${params}`);
  if (!res.ok) throw new Error(String(res.status));
  const body = (await res.json()) as { products: ProductListItem[] };
  return body.products;
}

/**
 * 최근 본 상품 줄.
 *
 * **볼 것이 없으면 아무것도 그리지 않는다.** 빈 상자에 "아직 없습니다" 를
 * 띄우면 처음 온 사람에게는 화면만 길어진다.
 */
export function RecentlyViewed({ excludeSlug }: { excludeSlug?: string } = {}) {
  const slugs = useRecentlyViewed((s) => s.slugs);
  const clear = useRecentlyViewed((s) => s.clear);
  const t = useT();
  const locale = useLocale();

  /**
   * localStorage 는 서버에 없다. 첫 렌더를 반드시 비워 두고 그다음에 채운다 —
   * 그러지 않으면 하이드레이션이 어긋난다. 장바구니 개수와 같은 이유다.
   */
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  /**
   * 지웠다고 알리기 위한 상태.
   *
   * 지우면 이 줄이 통째로 사라지는데, **사라지는 것은 눈으로만 보인다** —
   * 화면 낭독기 사용자에게는 버튼을 눌렀는데 아무 일도 일어나지 않은 것과
   * 같다. 그래서 말로 한 번 알린다.
   */
  const [cleared, setCleared] = useState(false);

  // 보고 있는 상품을 "최근 본" 에 다시 보여 줄 이유가 없다
  const wanted = slugs.filter((s) => s !== excludeSlug).slice(0, SHOWN);

  const { data } = useQuery({
    queryKey: ['recently-viewed', wanted],
    queryFn: () => fetchRecent(wanted),
    enabled: mounted && wanted.length > 0,
    // 가격이 바뀌는 값이라 오래 묵히지 않는다
    staleTime: 60_000,
  });

  const products = data ?? [];
  // 전부 내려간 상품이면 제목만 남는다. 그럴 바에는 그리지 않는다.
  const show = mounted && wanted.length > 0 && products.length > 0;

  /*
   * 알림 자리는 **늘 DOM 에 둔다.** 지우는 순간 함께 만들어 넣으면 낭독기가
   * 그 글을 놓치는 경우가 있다. 서버와 첫 렌더에서는 비어 있으므로
   * 하이드레이션도 어긋나지 않는다.
   */
  return (
    <>
      <p role="status" className="sr-only">
        {cleared ? t('recent.cleared') : ''}
      </p>

      {show && (
        <section aria-labelledby="recent-heading" className="pt-16">
          <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] pb-3">
            <h2 id="recent-heading" className="text-[15px] font-semibold">
              {t('recent.heading')}
            </h2>
            <button
              type="button"
              onClick={() => {
                clear();
                setCleared(true);
              }}
              className="h-9 shrink-0 text-[13px] text-[var(--fg-muted)] underline underline-offset-2 hover:text-[var(--fg)]"
            >
              {t('recent.clear')}
            </button>
          </div>

          {/*
            가로로 넘긴다. 세로로 쌓으면 이 줄이 본문만큼 길어지는데, 최근 본
            상품은 곁다리지 본문이 아니다.

            칸 안의 링크가 초점을 받으면 브라우저가 알아서 그 자리로 밀어 주므로
            키보드로도 끝까지 닿는다 — 스크롤 상자에 따로 tabindex 를 주면
            초점 순서에 빈 칸이 하나 생긴다.
          */}
          <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pt-6 pb-2 md:gap-6">
            {products.map((p) => (
              <li key={p.slug} className="w-[160px] shrink-0 snap-start md:w-[200px]">
                <ProductCard
                  locale={locale}
                  href={`/product/${p.slug}`}
                  linkComponent={AppLink}
                  imageComponent={AppImage}
                  imageSizes={IMAGE_SIZES}
                  brand={p.brand}
                  name={p.name}
                  price={p.price}
                  listPrice={p.listPrice}
                  discountPercent={p.discountPercent}
                  rating={p.rating}
                  reviewCount={p.reviewCount}
                  soldOut={p.soldOut}
                  isNew={p.isNew}
                  image={
                    p.imageUrl && p.imageAlt ? { src: p.imageUrl, alt: p.imageAlt } : undefined
                  }
                />
              </li>
            ))}
          </ul>

          {/* 어디에 남는 기록인지 밝힌다. 방문 기록은 밝히지 않으면 불쾌한 종류다. */}
          <p className="text-[11px] text-[var(--fg-muted)]">{t('recent.note')}</p>
        </section>
      )}
    </>
  );
}
