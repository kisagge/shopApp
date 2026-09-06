import NextImage from 'next/image';
import { isBlurDataUrl } from '@shop/core';
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
 *
 * **자리표시 그림은 여기서 한 번 확인한다.** DB 문자열이 그대로 브라우저가
 * 받아 오는 주소가 되는 자리라, 값이 되는 마지막 문 앞에서 본다 — 모양이
 * 아니면 없이 간다(톤 블록이 깔린다). 조회마다 적어 두면 한 곳이 낡는다.
 */
export const AppImage: ImageLike = ({ src, alt, className, sizes, priority, blurDataUrl }) => (
  <NextImage
    src={src}
    alt={alt}
    fill
    // sizes 가 없으면 next/image 가 화면 폭을 몰라 가장 큰 파일을 내려보낸다
    sizes={sizes ?? '100vw'}
    priority={priority ?? false}
    {...(isBlurDataUrl(blurDataUrl)
      ? { placeholder: 'blur' as const, blurDataURL: blurDataUrl }
      : {})}
    className={className}
  />
);
