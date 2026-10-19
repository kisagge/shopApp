import { NextResponse } from 'next/server';
import { APP_ID, appleTeamId, DEEP_LINK_PATHS, DEEP_LINK_BLOCKED } from '~/lib/deep-link';

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
             * **막을 것을 먼저 적는다.** 애플은 위에서부터 보다가 처음
             * 맞는 것에서 멈추므로, 순서가 뒤집히면 `/checkout/...` 이
             * `/` 에 걸려 앱으로 가 버린다.
             *
             * 목록은 `~/lib/deep-link` 가 쥔다 — 같은 규칙을 안드로이드
             * manifest 도 적어야 하고, 둘을 맞춰 보는 검사가 거기 있다.
             */
            components: [
              ...DEEP_LINK_BLOCKED.map((path) => ({ '/': `${path}*`, exclude: true })),
              ...DEEP_LINK_PATHS.map((path) => ({ '/': path === '/' ? '/' : `${path}*` })),
            ],
          },
        ],
      },
    },
    { headers: { 'content-type': 'application/json' } },
  );
}
