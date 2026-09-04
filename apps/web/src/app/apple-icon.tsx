import { ImageResponse } from 'next/og';
import { BrandMark } from '~/lib/brand-mark';

/**
 * 홈 화면에 추가했을 때 쓰이는 아이콘.
 *
 * **애플은 SVG 를 받지 않는다.** 그래서 이 한 장만 래스터로 만든다.
 * next/og 가 빌드 때 그려 주므로 저장소에 PNG 를 커밋하지 않아도 된다 —
 * 색이나 모양을 고칠 때 그림 파일을 다시 만들 필요가 없다.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  // 애플은 아이콘을 잘라 쓰지 않으므로 여백이 적어도 된다
  return new ImageResponse(<BrandMark size={180} padding={40} />, size);
}
