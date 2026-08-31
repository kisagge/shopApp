import type { Won } from '@shop/core';
import { cn } from '../lib/cn';
import { Badge } from './badge';
import { Price } from './price';

export interface ProductCardProps {
  readonly href: string;
  readonly brand: string;
  readonly name: string;
  readonly price: Won;
  readonly listPrice?: Won | undefined;
  readonly discountPercent?: number | undefined;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly soldOut?: boolean;
  readonly isNew?: boolean;
  /** 상품 이미지. 없으면 톤 블록 플레이스홀더가 들어간다 */
  readonly image?: { readonly src: string; readonly alt: string } | undefined;
  readonly placeholderTone?: 'sand' | 'stone' | 'clay' | 'olive' | 'mist';
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
  image, placeholderTone = 'sand', className,
}: ProductCardProps) {
  return (
    <article className={cn('relative flex flex-col gap-2.5', className)}>
      <a href={href} className="flex flex-col gap-2.5 no-underline">
        <div
          className={cn(
            'relative flex aspect-4/5 items-center justify-center overflow-hidden rounded-sm',
            image ? 'bg-[var(--surface-2)]' : TONE[placeholderTone],
          )}
        >
          {image ? (
            <img src={image.src} alt={image.alt} className="h-full w-full object-cover" />
          ) : (
            // 장식용 플레이스홀더. 상품명은 아래 제목이 이미 전달한다.
            <span aria-hidden="true" className="text-[11px] tracking-widest text-n-500">
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
              품절
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
          />
          {rating !== undefined && reviewCount !== undefined && (
            <p className="flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
              <span aria-hidden="true" className="text-warning-graphic">
                ★
              </span>
              <span className="tnum">{rating.toFixed(1)}</span>
              <span aria-hidden="true">·</span>
              <span>
                리뷰 <span className="tnum">{reviewCount.toLocaleString('ko-KR')}</span>
              </span>
            </p>
          )}
        </div>
      </a>
    </article>
  );
}
