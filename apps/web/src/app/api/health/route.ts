import { NextResponse } from 'next/server';
import { markRequest, serverTiming } from '~/lib/diagnostics/boot';

/**
 * Capacitor 셸이 원격 서버 도달 가능 여부를 판단할 때 쓴다.
 * 실패하면 앱은 번들된 오프라인 화면으로 폴백한다.
 *
 * **DB 를 치지 않는다.** 도달 가능 여부를 묻는 창구가 DB 에 매이면, DB 가
 * 잠깐 흔들릴 때 앱이 서버가 죽은 줄 안다. 그리고 그 덕분에 이 창구가
 * **콜드 스타트에서 DB 몫을 뺀 시간**을 재는 자를 겸한다.
 */
export function GET() {
  const timing = markRequest();

  return NextResponse.json(
    {
      ok: true,
      service: 'shop-web',
      time: new Date().toISOString(),
    },
    { headers: { 'server-timing': serverTiming(timing) } },
  );
}
