import { NextResponse } from 'next/server';

/**
 * Capacitor 셸이 원격 서버 도달 가능 여부를 판단할 때 쓴다.
 * 실패하면 앱은 번들된 오프라인 화면으로 폴백한다.
 */
export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'shop-web',
    time: new Date().toISOString(),
  });
}
