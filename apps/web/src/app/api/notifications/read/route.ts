import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { prisma } from '@shop/db';
import { CONSOLE_NOTIFICATION_KIND, CUSTOMER_NOTIFICATION_KIND } from '@shop/core';
import { unauthorized } from '~/lib/api/respond';

/**
 * 안 읽은 알림을 모두 읽음으로.
 *
 * **POST 다.** 목록 화면을 열기만 해도 지워지게 하려면 GET 이 값을 바꿔야
 * 하는데, 그러면 브라우저가 미리 받아 두는 것만으로 뱃지가 사라진다.
 * 화면이 뜬 뒤 이 창구를 한 번 부른다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  /*
   * **어느 알림함을 열었는지 받는다.** 없으면 매장이다.
   *
   * 한동안 이 창구는 알림 종류를 가리지 않았다. 알림함이 하나일 때는 그게
   * 맞았는데, 운영 알림함이 생기자 **매장 알림함을 한 번 여는 것만으로 운영
   * 알림까지 읽음이 됐다** — 가맹점이 매장에 들렀다 가면 재고 부족 뱃지가
   * 아무 말 없이 사라진다. 읽지도 않은 것을 읽었다고 적는 셈이다.
   */
  const box = new URL(request.url).searchParams.get('box') === 'console' ? 'console' : 'customer';
  const kinds = box === 'console' ? [...CONSOLE_NOTIFICATION_KIND] : [...CUSTOMER_NOTIFICATION_KIND];

  // 이미 읽은 것은 건드리지 않는다 — 읽은 시각이 뒤로 밀리면 안 된다
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null, kind: { in: kinds } },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ marked: count });
}
