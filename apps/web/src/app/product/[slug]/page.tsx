import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Badge, Price } from '@shop/ui';
import {
  formatWithUnit, productStructuredData, breadcrumbStructuredData,
} from '@shop/core';
import { headers } from 'next/headers';
import { getSessionUser } from '@shop/auth/session';
import { absoluteUrl } from '~/lib/urls';
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
  const summary = product.description.slice(0, 120);
  const path = `/product/${slug}`;

  return {
    title: product.name,
    description: summary,
    // 같은 상품이 여러 주소로 잡히지 않게 정본을 알려 준다
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      url: path,
      title: `${product.brand} ${product.name}`,
      description: summary,
      // 링크를 붙였을 때 뜨는 그림. 없으면 글자만 나간다.
      ...(product.images[0] ? { images: [{ url: product.images[0].url, alt: product.images[0].alt }] } : {}),
    },
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

  /*
   * 검색엔진이 읽는 구조화 데이터.
   *
   * 화면이 이미 쓰는 값을 그대로 넘긴다 — 여기서 따로 계산하면 화면과
   * 어긋나고, 어긋난 구조화 데이터는 리치 결과가 통째로 빠지는 이유가 된다.
   */
  const url = absoluteUrl(`/product/${slug}`);
  const jsonLd = [
    productStructuredData({
      url,
      name: product.name,
      description: product.description,
      brand: product.brand,
      images: product.images.map((image) => image.url),
      price: product.price,
      soldOut: product.soldOut,
      rating: product.rating,
      reviewCount: product.reviewCount,
    }),
    breadcrumbStructuredData([
      { name: '홈', url: absoluteUrl('/') },
      { name: product.categoryName, url: absoluteUrl(`/category/${product.categorySlug}`) },
      { name: product.name, url },
    ]),
  ];

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      {/*
        JSON.stringify 의 결과를 그대로 넣는다. 상품명·설명은 운영자가
        입력하는 값이라 </script> 가 들어올 수 있는데, `<` 를 이스케이프하면
        그 자리에서 스크립트가 끊기는 일을 막는다.
      */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

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
          className="relative flex aspect-4/5 items-center justify-center rounded-md bg-ph-sand lg:aspect-auto lg:h-[700px]"
        >
          {product.images[0] ? (
            <Image
              src={product.images[0].url}
              alt={product.images[0].alt}
              fill
              // 좁은 화면에서는 폭 전체, 넓은 화면에서는 오른쪽 452px 을 뺀 만큼
              sizes="(min-width: 1024px) calc(100vw - 452px), 100vw"
              // 이 화면의 가장 큰 그림이자 첫 화면에 있다. 늦게 받으면 그대로 체감된다.
              priority
              className="rounded-md object-cover"
            />
          ) : (
            <span aria-hidden="true" className="text-[11px] tracking-widest text-n-500">IMAGE</span>
          )}

          {/*
            우리가 찍지 않은 사진에는 출처를 밝힌다.
            라이선스가 강제하지 않더라도, 남의 결과물을 우리 매대에 쓰면서
            누구 것인지 적지 않을 이유가 없다.
          */}
          {product.images[0]?.credit && (
            <p className="absolute right-2 bottom-2 rounded-xs bg-n-900/55 px-2 py-1 text-[10px] text-n-0">
              사진{' '}
              {product.images[0].creditUrl ? (
                <a
                  href={product.images[0].creditUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-n-0 underline"
                >
                  {product.images[0].credit}
                </a>
              ) : (
                product.images[0].credit
              )}
              {' · Unsplash'}
            </p>
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
