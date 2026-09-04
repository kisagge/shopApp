import NextImage from 'next/image';
import type { ImageLike } from '@shop/ui';

/**
 * packages/ui 의 ImageLike 계약을 next/image 로 이어 주는 어댑터.
 *
 * AppLink 와 같은 결이다 — UI 패키지를 next 에 묶지 않고 앱에서 한 번만
 * 이어 준다.
 *
 * **fill 을 쓴다.** 목록 카드는 가로세로 비율(aspect-4/5)로 자리를 잡고
 * 실제 픽셀 크기는 화면 폭에 따라 달라져서, width·height 를 숫자로 적을
 * 수가 없다. fill 은 부모가 position:relative 여야 하는데 카드의 이미지
 * 칸이 이미 그렇다.
 */
export const AppImage: ImageLike = ({ src, alt, className, sizes, priority }) => (
  <NextImage
    src={src}
    alt={alt}
    fill
    // sizes 가 없으면 next/image 가 화면 폭을 몰라 가장 큰 파일을 내려보낸다
    sizes={sizes ?? '100vw'}
    priority={priority ?? false}
    className={className}
  />
);
