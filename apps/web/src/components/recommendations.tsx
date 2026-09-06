import { worthShowing } from '@shop/core';
import { ProductCard } from '@shop/ui';
import { getRecommendations } from '~/lib/queries/catalog/recommend';
import { getLocale, getT } from '~/lib/i18n/server';
import { AppLink } from './app-link';
import { AppImage } from './app-image';

/** 한 줄에 그릴 최대 개수 */
const SHOWN = 8;

/** 가로 한 칸의 폭에 맞춘 표시 크기. 이 값이 어긋나면 최적화가 헛돈다. */
const IMAGE_SIZES = '(min-width: 768px) 200px, 160px';

/**
 * 함께 본 상품.
 *
 * **제목이 근거를 따라간다.** 함께 본 기록이 들어간 줄에만 "함께 본 상품"
 * 이라고 적는다 — 인기 상품으로 채운 줄에 그렇게 적으면 사실이 아니다.
 *
 * **찜 버튼을 붙이지 않는다.** 붙이려면 보는 사람이 누구인지 알아야 하고,
 * 그러면 이 줄이 사람마다 달라져 캐싱할 수 없게 된다 — 추천은 사람이 아니라
 * 상품에 붙는 값이라 모두에게 같아도 된다.
 */
export async function Recommendations({
  productId,
  categorySlug,
}: {
  productId: string;
  categorySlug: string;
}) {
  const [{ items, fromCoView }, locale, t] = await Promise.all([
    getRecommendations({ productId, categorySlug, limit: SHOWN }),
    getLocale(),
    getT(),
  ]);

  // 한두 개만 뜨는 줄은 추천이 아니라 빈자리처럼 보인다
  if (!worthShowing(items.length)) return null;

  return (
    <section aria-labelledby="rec-heading" className="pt-16">
      <h2
        id="rec-heading"
        className="border-b border-[var(--border)] pb-3 text-[15px] font-semibold"
      >
        {t(fromCoView ? 'rec.heading' : 'rec.headingPopular')}
      </h2>

      {/* 최근 본 상품과 같은 가로 줄. 곁다리지 본문이 아니다. */}
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pt-6 pb-2 md:gap-6">
        {items.map((p) => (
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
              image={p.imageUrl && p.imageAlt ? { src: p.imageUrl, alt: p.imageAlt } : undefined}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
