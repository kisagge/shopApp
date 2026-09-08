import { NextResponse } from 'next/server';
import { APP_ID, appleTeamId } from '~/lib/deep-link';

/**
 * iOS 유니버설 링크.
 *
 * **확장자가 없는 주소이고 application/json 으로 나가야 한다.** 애플은
 * `/.well-known/apple-app-site-association` 를 그대로 받아 가고, 리다이렉트도
 * 따르지 않는다.
 *
 * 팀 ID 가 없으면 404 다 — assetlinks 와 같은 이유다.
 */
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const team = appleTeamId();
  if (team === null) return new NextResponse(null, { status: 404 });

  return NextResponse.json(
    {
      applinks: {
        details: [
          {
            appIDs: [`${team}.${APP_ID}`],
            /*
             * 앱으로 보낼 주소와 보내지 않을 주소.
             *
             * 결제창은 앱으로 가로채면 안 된다 — 결제사가 돌려보내는
             * 주소까지 앱이 먹으면 승인 흐름이 끊긴다. 인증 창구도 같다.
             */
            components: [
              { '/': '/api/*', exclude: true },
              { '/': '/checkout/*', exclude: true },
              { '/': '/product/*' },
              { '/': '/category/*' },
              { '/': '/brand/*' },
              { '/': '/collection/*' },
              { '/': '/' },
            ],
          },
        ],
      },
    },
    { headers: { 'content-type': 'application/json' } },
  );
}
