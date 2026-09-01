import { RATING_MAX } from '@shop/core';

/**
 * 별점 표시.
 *
 * 별 모양은 장식이고 **숫자가 실제 정보**다. 별만 그리면 스크린리더에는
 * "★★★☆☆" 가 그대로 읽히거나 아무것도 안 읽힌다. 별은 숨기고 값을 읽힌다.
 */
export function ReviewStars({
  rating,
  size = 'sm',
  showValue = false,
}: {
  rating: number;
  size?: 'sm' | 'md';
  showValue?: boolean;
}) {
  const filled = Math.round(rating);
  const cls = size === 'md' ? 'text-[17px]' : 'text-[13px]';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`${cls} tracking-[0.06em] text-warning-graphic`}>
        {'★'.repeat(filled)}
        <span className="text-n-300">{'★'.repeat(RATING_MAX - filled)}</span>
      </span>
      {showValue && (
        <span className="tnum text-[13px] font-semibold">{rating.toFixed(1)}</span>
      )}
      <span className="sr-only">5점 만점에 {rating.toFixed(1)}점</span>
    </span>
  );
}
