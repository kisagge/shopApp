import { NextResponse } from 'next/server';
import { APP_ID, androidFingerprints } from '~/lib/deep-link';

/**
 * 안드로이드 앱 링크.
 *
 * 이 파일이 있어야 `https://…/product/…` 링크가 브라우저가 아니라 앱으로
 * 열린다. 구글이 앱을 설치할 때 이 주소를 받아 가 서명 지문을 견준다.
 *
 * **지문이 없으면 404 다.** 자리만 채운 파일을 올리면 그것이 캐시돼,
 * 나중에 진짜 값을 넣어도 한동안 옛것으로 판단한다.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const fingerprints = androidFingerprints();
  if (fingerprints.length === 0) return new NextResponse(null, { status: 404 });

  return NextResponse.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ]);
}
