import type { ComponentType, ReactNode } from 'react';
import type { Won } from '@shop/core';
import { createTranslator, DEFAULT_LOCALE, type Locale } from '@shop/i18n';
import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Price } from './price';

/**
 * 링크 컴포넌트의 최소 계약.
 *
 * packages/ui 는 next 에 의존하지 않는다 — 그러면 Storybook·Vitest·다른 앱에서
 * 쓸 수 없게 된다. 대신 이 모양을 만족하는 컴포넌트를 받는다.
 * Next 앱은 next/link 를, 그 밖에서는 기본값인 <a> 를 쓴다.
 */
export interface LinkLikeProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}
export type LinkLike = ComponentType<LinkLikeProps>;

const DefaultLink: LinkLike = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

/**
 * 이미지 컴포넌트의 최소 계약.
 *
 * 링크와 같은 이유로 주입받는다. Next 앱은 next/image 를 넘겨 크기별로
 * 줄인 파일을 받고, 그 밖에서는 기본값인 <img> 가 원본을 그대로 쓴다.
 *
 * `sizes` 는 최적화에 **반드시 필요하다.** 없으면 next/image 가 화면 폭을
 * 알 수 없어 가장 큰 파일을 내려보낸다 — 최적화를 붙이고도 아무것도 줄지
 * 않는 상태가 된다.
 */
export interface ImageLikeProps {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  readonly sizes?: string;
  /** 첫 화면에 보이는 이미지에만. 레이지 로딩을 끄고 먼저 받는다. */
  readonly priority?: boolean;
  /**
   * 사진이 도착하기 전 그 자리에 깔 아주 작은 같은 사진(데이터 URI).
   *
   * 없으면 지금처럼 톤 블록이 깔린다 — **자리는 어느 쪽이든 비지 않는다.**
   *
   * null 도 받는다. DB 의 칸이 비어 있을 수 있는 값이라, 넘기는 쪽마다
   * undefined 로 바꾸게 하면 그 변환이 열 곳에 흩어진다.
   */
  readonly blurDataUrl?: string | null;
}
export type ImageLike = ComponentType<ImageLikeProps>;

// 이 패키지는 next 를 모른다. 최적화가 필요한 앱은 imageComponent 를 넘긴다.
const DefaultImage: ImageLike = ({ src, alt, className }) => (
  <img src={src} alt={alt} className={className} />
);

export interface ProductCardProps {
  readonly href: string;
  readonly brand: string;
  readonly name: string;
  readonly price: Won;
  readonly listPrice?: Won | undefined;
  readonly discountPercent?: number | undefined;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  /** Price 와 같은 이유로 쓰는 쪽이 알려 준다 */
  readonly locale?: Locale;
  readonly soldOut?: boolean;
  readonly isNew?: boolean;
  /** 상품 이미지. 없으면 톤 블록 플레이스홀더가 들어간다 */
  readonly image?: {
    readonly src: string;
    readonly alt: string;
    readonly blurDataUrl?: string | null | undefined;
  } | undefined;
  readonly placeholderTone?: 'sand' | 'stone' | 'clay' | 'olive' | 'mist';
  /**
   * 라우팅을 담당할 컴포넌트. 기본은 평범한 <a> 라 전체 페이지 이동이 난다.
   * Next 앱에서는 next/link 를 넘겨 클라이언트 내비게이션과 프리페치를 쓴다.
   */
  readonly linkComponent?: LinkLike;
  /**
   * 이미지를 담당할 컴포넌트. 기본은 평범한 <img> 라 원본이 그대로 나간다.
   * Next 앱에서는 next/image 를 넘겨 화면 폭에 맞는 크기를 받는다.
   */
  readonly imageComponent?: ImageLike;
  /**
   * 화면 폭에 따른 표시 크기(sizes 속성).
   *
   * 목록은 격자 열 수가 화면마다 달라서 카드가 스스로 알 수 없다. 격자를
   * 아는 쪽이 알려 줘야 한다.
   */
  readonly imageSizes?: string;
  /** 첫 화면에 보이는 카드에만 true. 목록 전체에 주면 의미가 없다. */
  readonly imagePriority?: boolean;
  /**
   * 찜 버튼 자리.
   *
   * 버튼을 여기서 직접 만들지 않고 받아 끼운다 — 이 패키지는 표현만 맡고
   * 세션·요청 같은 앱의 관심사를 모른다. linkComponent 와 같은 결이다.
   * 링크 **바깥**에 그려지므로 카드 이동과 키보드 순서가 꼬이지 않는다.
   */
  readonly wishlistButton?: ReactNode;
  readonly className?: string;
}

const TONE = {
  sand: 'bg-ph-sand', stone: 'bg-ph-stone', clay: 'bg-ph-clay',
  olive: 'bg-ph-olive', mist: 'bg-ph-mist',
} as const;

/**
 * 상품 하나는 하나의 article이다. 카드 전체를 a로 감싸되 좋아요 버튼은
 * 링크 바깥에 둔다 — 링크 안에 버튼을 넣으면 유효하지 않은 HTML이 되고
 * 키보드 순서도 꼬인다.
 */
export function ProductCard({
  href, brand, name, price, listPrice, discountPercent,
  rating, reviewCount, soldOut = false, isNew = false,
  image, placeholderTone = 'sand', linkComponent, wishlistButton, className,
  imageComponent, imageSizes, imagePriority = false, locale = DEFAULT_LOCALE,
}: ProductCardProps) {
  const Link = linkComponent ?? DefaultLink;
  const Image = imageComponent ?? DefaultImage;
  const t = createTranslator(locale);
  return (
    <article className={cn('relative flex flex-col gap-2.5', className)}>
      {wishlistButton && (
        <div className="absolute top-2 right-2 z-10">{wishlistButton}</div>
      )}
      <Link href={href} className="flex flex-col gap-2.5 no-underline">
        <div
          className={cn(
            'relative flex aspect-4/5 items-center justify-center overflow-hidden rounded-sm',
            image ? 'bg-[var(--surface-2)]' : TONE[placeholderTone],
          )}
        >
          {image ? (
            <Image
              src={image.src}
              alt={image.alt}
              className="h-full w-full object-cover"
              {...(imageSizes ? { sizes: imageSizes } : {})}
              {...(image.blurDataUrl ? { blurDataUrl: image.blurDataUrl } : {})}
              priority={imagePriority}
            />
          ) : (
            // 장식용 플레이스홀더. 상품명은 아래 제목이 이미 전달한다.
            <span aria-hidden="true" className="text-[11px] tracking-widest text-n-700">
              IMAGE
            </span>
          )}

          {!soldOut && discountPercent !== undefined && discountPercent > 0 && (
            // 할인율은 아래 Price가 이미 읽어 준다. 뱃지까지 읽으면 같은 말을 두 번 듣게 된다.
            <Badge aria-hidden="true" tone="sale" className="absolute top-2 left-2 h-5 px-1.5 text-[10px]">
              {discountPercent}%
            </Badge>
          )}
          {!soldOut && isNew && discountPercent === undefined && (
            <Badge tone="new" className="absolute top-2 left-2 h-5 px-1.5 text-[10px]">
              NEW
            </Badge>
          )}
          {soldOut && (
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/70 text-sm font-medium text-[var(--fg-secondary)]">
              {t('catalog.soldOut')}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[10px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">{brand}</p>
          <h3
            className={cn(
              'text-xs leading-snug',
              soldOut ? 'text-[var(--fg-muted)]' : 'text-[var(--fg)]',
            )}
          >
            {name}
          </h3>
          <Price
            amount={price}
            listPrice={listPrice}
            discountPercent={discountPercent}
            size="sm"
            locale={locale}
          />
          {rating !== undefined && reviewCount !== undefined && (
            <p className="flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
              <span aria-hidden="true" className="text-warning-graphic">
                ★
              </span>
              <span className="tnum">{rating.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {t('product.reviewCount', { count: reviewCount })}
              </span>
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
