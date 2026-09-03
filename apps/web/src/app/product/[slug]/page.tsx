import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Badge, Price } from '@shop/ui';
import { formatWithUnit } from '@shop/core';
import { headers } from 'next/headers';
import { getSessionUser } from '@shop/auth/session';
import { getSubscribedVariantIds } from '~/lib/restock/query';
import { getProductBySlug } from '~/lib/queries/products';
import { getProductReviews, getReviewSummary } from '~/lib/queries/reviews';
import { ProductOptions } from '~/components/product-options';
import { ReviewSection } from '~/components/review-section';
import { WishlistButton } from '~/components/wishlist-button';
import { getWishlistedIds } from '~/lib/wishlist/wishlist';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: '상품을 찾을 수 없습니다' };
  return {
    title: product.name,
    description: product.description.slice(0, 120),
    openGraph: { title: `${product.brand} ${product.name}`, description: product.description.slice(0, 120) },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  // 내가 쓴 리뷰인지 표시하려면 세션이 필요하다. 없어도 페이지는 그려진다.
  const viewer = await getSessionUser(await headers());
  const [summary, reviews, wishlisted, restockOn] = await Promise.all([
    getReviewSummary(product.id),
    getProductReviews(product.id, { viewerId: viewer?.id }),
    viewer ? getWishlistedIds(viewer.id, [product.id]) : Promise.resolve(new Set<string>()),
    // 품절 옵션에 이미 알림을 걸어 뒀는지. 옵션마다 물으면 옵션 수만큼 쿼리가 나간다.
    viewer
      ? getSubscribedVariantIds(viewer.id, product.variants.map((v) => v.id))
      : Promise.resolve(new Set<string>()),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <nav aria-label="현재 위치" className="py-5">
        <ol className="flex items-center gap-2">
          <li><Link href="/" className="text-xs text-[var(--fg-muted)]">홈</Link></li>
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li>
            <Link href={`/category/${product.categorySlug}`} className="text-xs text-[var(--fg-muted)]">
              {product.categoryName}
            </Link>
          </li>
          <li aria-hidden="true" className="text-[11px] text-n-300">/</li>
          <li><span aria-current="page" className="text-xs font-medium text-[var(--fg-secondary)]">{product.name}</span></li>
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_452px] lg:gap-10">
        <div
          role="img"
          aria-label={`${product.name} 대표 이미지`}
          className="flex aspect-4/5 items-center justify-center rounded-md bg-ph-sand lg:aspect-auto lg:h-[700px]"
        >
          {product.images[0] ? (
            <img src={product.images[0].url} alt={product.images[0].alt} className="h-full w-full rounded-md object-cover" />
          ) : (
            <span aria-hidden="true" className="text-[11px] tracking-widest text-n-500">IMAGE</span>
          )}
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <Link href={`/category/${product.categorySlug}`} className="text-[11px] font-medium tracking-[0.1em] text-[var(--fg-secondary)]">
              {product.brand}
            </Link>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl leading-snug font-semibold tracking-tight md:text-[26px]">{product.name}</h1>
              <WishlistButton
                productId={product.id}
                productName={product.name}
                initialWishlisted={wishlisted.has(product.id)}
                loggedIn={viewer !== null}
                size="md"
              />
            </div>
            {product.rating !== undefined && (
              <p className="flex items-center gap-1.5 text-[13px] text-[var(--fg-secondary)]">
                <span aria-hidden="true" className="text-warning-graphic">★</span>
                <span className="tnum font-semibold text-[var(--fg)]">{product.rating.toFixed(1)}</span>
                <span aria-hidden="true" className="text-n-300">·</span>
                <span>리뷰 <span className="tnum">{product.reviewCount.toLocaleString('ko-KR')}</span>개</span>
              </p>
            )}
            {product.soldOut && <Badge tone="danger" className="w-fit">전 옵션 품절</Badge>}
          </div>

          <div className="border-b border-[var(--border)] pb-5">
            <Price
              amount={product.price}
              listPrice={product.discountPercent > 0 ? product.listPrice : undefined}
              discountPercent={product.discountPercent > 0 ? product.discountPercent : undefined}
              size="lg"
            />
          </div>

          <dl className="flex flex-col gap-3">
            <div className="flex gap-3.5">
              <dt className="w-14 shrink-0 text-[13px] text-[var(--fg-muted)]">적립</dt>
              <dd className="text-[13px]">구매 시 <span className="tnum font-semibold">{formatWithUnit(product.price).replace('원', '')}</span>의 1% 적립</dd>
            </div>
            <div className="flex gap-3.5">
              <dt className="w-14 shrink-0 text-[13px] text-[var(--fg-muted)]">배송</dt>
              <dd className="text-[13px] leading-relaxed">5만원 이상 무료배송 · 제주·도서산간 3,000원 추가</dd>
            </div>
          </dl>

          <ProductOptions
            product={product}
            loggedIn={viewer !== null}
            restockOn={[...restockOn]}
          />
        </div>
      </div>

      <section aria-labelledby="desc-title" className="pt-16">
        <h2 id="desc-title" className="border-b border-[var(--border)] pb-3 text-[15px] font-semibold">상품 정보</h2>
        <p className="max-w-[620px] pt-6 text-[15px] leading-loose text-[var(--fg-secondary)]">
          {product.description}
        </p>
      </section>

      <div className="pt-16">
        <ReviewSection summary={summary} reviews={reviews.items} />
      </div>
    </div>
  );
}
