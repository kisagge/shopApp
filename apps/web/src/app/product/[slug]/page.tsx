import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Metadata } from 'next';
import { Badge, Price } from '@shop/ui';
import {
  DEFAULT_SHIPPING, GRADE_REWARD_PERCENT, percentOf,
  productStructuredData, breadcrumbStructuredData,
} from '@shop/core';
import { formatMoney, formatNumber } from '@shop/i18n';
import { headers } from 'next/headers';
import { getSessionUser } from '@shop/auth/session';
import { absoluteUrl } from '~/lib/urls';
import { getSubscribedVariantIds } from '~/lib/restock/query';
import { getProductBySlug } from '~/lib/queries/products';
import { ProductOptions } from '~/components/product-options';
import { ProductReviews } from '~/components/product-reviews';
import { ProductInquiries } from '~/components/product-inquiries';
import { SectionSkeleton, StripSkeleton } from '~/components/section-skeleton';
import { WishlistButton } from '~/components/wishlist-button';
import { RecordRecentView } from '~/components/record-recent-view';
import { RecentlyViewed } from '~/components/recently-viewed';
import { Recommendations } from '~/components/recommendations';
import { getWishlistedIds } from '~/lib/wishlist/wishlist';
import { getEffectiveGrade } from '~/lib/grade/effective';
import { getLocale, getT } from '~/lib/i18n/server';
import { reviewListQuerySchema } from '@shop/contract';

export const dynamic = 'force-dynamic';

interface Params {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: (await getT())('product.notFound') };
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

export default async function ProductPage({ params, searchParams }: Params) {
  const { slug } = await params;
  /*
   * 정렬은 주소에 남긴다. 잘못된 값이 들어와도 화면이 죽지 않게 계약이
   * 기본값으로 되돌린다(catch).
   *
   * 주소에서는 `reviewSort` 라고 부른다 — 이 화면에 나중에 다른 정렬이
   * 생겨도 서로 부딪히지 않게 하려는 것이다. **계약이 읽는 이름은 `sort`
   * 이므로 여기서 옮겨 담는다.** 그대로 넘겼더니 계약이 값을 못 찾고
   * 기본값으로 되돌려서, 탭은 눌리는데 목록은 그대로였다.
   */
  const reviewSort = reviewListQuerySchema.parse({
    sort: (await searchParams)['reviewSort'],
  }).sort;
  /*
   * **상품과 세션은 서로를 기다릴 이유가 없다.** 예전에는 상품을 받고 나서야
   * 세션을 물어, 왕복 한 번이 그냥 더 붙었다.
   */
  const [product, viewer, locale, t] = await Promise.all([
    getProductBySlug(slug),
    // 내가 쓴 리뷰인지 표시하려면 세션이 필요하다. 없어도 페이지는 그려진다.
    headers().then((h) => getSessionUser(h)),
    getLocale(),
    getT(),
  ]);
  if (!product) notFound();

  /**
   * 여기 적는 적립률은 **실제로 붙을 적립률이어야 한다.**
   *
   * 예전에는 1% 라고 못 박혀 있었다. 등급이 올라 2% 를 받는 사람에게도
   * 1% 라고 적혀 있었다는 뜻이다 — 마이페이지에서 고쳤던 것과 같은 어긋남이,
   * 상품 화면에는 그대로 남아 있었다. 등급을 정하는 곳에서 같이 받아 온다.
   */
  const rewardPercent = viewer ? (await getEffectiveGrade(viewer.id)).rewardPercent : GRADE_REWARD_PERCENT.BASIC;

  /*
   * **첫 화면에 필요한 것만 기다린다.**
   *
   * 예전에는 리뷰·문의까지 여기서 함께 받았다. 그래서 상품 사진과 가격이
   * 준비된 뒤에도 **화면 아래쪽 조회가 끝날 때까지 아무 픽셀도 나가지
   * 않았다.** 아래쪽은 Suspense 로 내려보내고 여기서는 히어로만 챙긴다.
   */
  const [wishlisted, restockOn] = await Promise.all([
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
      { name: t('nav.home'), url: absoluteUrl('/') },
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

      <nav aria-label={t('nav.breadcrumb')} className="py-5">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="text-xs text-[var(--fg-muted)]">
              {t('nav.home')}
            </Link>
          </li>
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
          aria-label={t('product.mainImage', { name: product.name })}
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
              {t('product.photoCredit')}{' '}
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
                <span>{t('product.reviewCount', { count: product.reviewCount })}</span>
              </p>
            )}
            {product.soldOut && (
              <Badge tone="danger" className="w-fit">
                {t('product.allSoldOut')}
              </Badge>
            )}
          </div>

          <div className="border-b border-[var(--border)] pb-5">
            <Price
              amount={product.price}
              listPrice={product.discountPercent > 0 ? product.listPrice : undefined}
              discountPercent={product.discountPercent > 0 ? product.discountPercent : undefined}
              size="lg"
              locale={locale}
            />
          </div>

          <dl className="flex flex-col gap-3">
            <div className="flex gap-3.5">
              <dt className="w-14 shrink-0 text-[13px] text-[var(--fg-muted)]">
                {t('product.rewardLabel')}
              </dt>
              <dd className="tnum text-[13px]">
                {t('product.rewardValue', {
                  points: formatNumber(locale, percentOf(product.price, rewardPercent)),
                  percent: rewardPercent,
                })}
              </dd>
            </div>
            <div className="flex gap-3.5">
              <dt className="w-14 shrink-0 text-[13px] text-[var(--fg-muted)]">
                {t('product.shippingLabel')}
              </dt>
              <dd className="text-[13px] leading-relaxed">
                {t('product.shippingValue', {
                  threshold: formatMoney(locale, DEFAULT_SHIPPING.freeThreshold ?? 0),
                  surcharge: formatMoney(locale, DEFAULT_SHIPPING.remoteSurcharge),
                })}
              </dd>
            </div>
          </dl>

          <ProductOptions
            product={product}
            loggedIn={viewer !== null}
            restockOn={[...restockOn]}
          />

          {/* 이 상품을 봤다고 기기에 적는다. 화면에는 나오지 않는다. */}
          <RecordRecentView slug={product.slug} />
        </div>
      </div>

      <section aria-labelledby="desc-title" className="pt-16">
        <h2 id="desc-title" className="border-b border-[var(--border)] pb-3 text-[15px] font-semibold">
          {t('product.info')}
        </h2>
        <p className="max-w-[620px] pt-6 text-[15px] leading-loose text-[var(--fg-secondary)]">
          {product.description}
        </p>
      </section>

      {/*
        여기부터는 **먼저 그리고 나중에 채운다.**
        리뷰와 문의는 첫 화면 밖에 있는데, 예전에는 이것들이 끝나야 상품
        사진 한 장도 나가지 않았다. 각각 따로 감싸는 이유는 하나로 묶으면
        느린 쪽이 빠른 쪽을 붙잡기 때문이다.
      */}
      <div className="pt-16">
        <Suspense fallback={<SectionSkeleton height="420px" label={t('review.heading')} />}>
          <ProductReviews
            productId={product.id}
            slug={slug}
            viewerId={viewer?.id}
            loggedIn={viewer !== null}
            sort={reviewSort}
          />
        </Suspense>
        <Suspense fallback={<SectionSkeleton height="280px" label={t('product.inquiries')} />}>
          <ProductInquiries productId={product.id} viewer={viewer} />
        </Suspense>
      </div>

      {/*
        추천을 최근 본 상품보다 앞에 둔다. 최근 본 것은 이미 아는 상품이고,
        추천은 모르던 것을 보여 준다 — 뒤에 둘 이유가 없다.
      */}
      <Suspense fallback={<StripSkeleton height="360px" />}>
        <Recommendations productId={product.id} categorySlug={product.categorySlug} />
      </Suspense>

      {/* 지금 보고 있는 상품은 빼고 보여 준다 */}
      <RecentlyViewed excludeSlug={product.slug} />
    </div>
  );
}
