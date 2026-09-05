import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { prisma } from '@shop/db';

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
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  // 이미 읽은 것은 건드리지 않는다 — 읽은 시각이 뒤로 밀리면 안 된다
  const { count } = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ marked: count });
}
