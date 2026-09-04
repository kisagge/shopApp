import { ImageResponse } from 'next/og';
import { BrandMark } from '~/lib/brand-mark';

/**
 * 홈 화면에 추가했을 때 쓰이는 아이콘.
 *
 * manifest 는 **정해진 주소**를 요구해서(해시가 붙으면 안 된다) 라우트로
 * 만든다. 저장소에 PNG 를 커밋하지 않아도 되고, 색이나 모양을 고칠 때
 * 그림 파일을 다시 만들 필요가 없다 — 애플 아이콘과 같은 방식이다.
 *
 * **여백을 넉넉히 준다.** 안드로이드는 아이콘을 원형·둥근사각형 등으로
 * 잘라 쓰는데(maskable), 가장자리까지 그림이 차 있으면 P 의 획이 잘린다.
 * 안전 영역은 가운데 80% 라 양쪽에 10% 씩 둔다.
 */
const ALLOWED = new Set(['192', '512']);

export function generateStaticParams(): { size: string }[] {
  return [...ALLOWED].map((size) => ({ size }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
): Promise<Response> {
  const { size } = await params;
  if (!ALLOWED.has(size)) return new Response('Not found', { status: 404 });

  const px = Number(size);
  return new ImageResponse(<BrandMark size={px} padding={Math.round(px * 0.22)} />, {
    width: px,
    height: px,
  });
}
