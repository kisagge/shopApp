import { NextResponse } from 'next/server';
import { prisma } from '@shop/db';
import { getActor } from '@shop/auth/session';
import { hasPermission } from '@shop/core';
import { forbidden } from '~/lib/api/respond';

/**
 * 쿠폰을 줄 회원을 고를 때 쓰는 검색.
 *
 * 상품 검색 창구와 같은 결이다 — 이름으로 찾아 고른다. 권한은
 * `user:read` 로, **"회원 목록을 볼 수 있느냐"** 를 묻는다. 실제로 줄 수
 * 있는지는 지급 창구가 `coupon:write` 로 다시 본다.
 *
 * **가맹점은 못 본다.** 상품과 달리 회원에는 소속으로 나눌 범위가 없고,
 * 남의 고객 명단을 훑을 이유도 없다. `user:read` 자체가 운영진 권한이다.
 *
 * **검색어 없이는 아무것도 주지 않는다.** 창구를 열자마자 전체 명단이
 * 흘러나오면, 고르는 화면이 아니라 명단을 내려받는 창구가 된다.
 *
 * **탈퇴한 회원은 뺀다.** 줄 수 없는 사람을 목록에 두면 골라 놓고 실패한다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor || !hasPermission(actor, 'user:read')) {
    return await forbidden();
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length === 0) return NextResponse.json({ users: [] });

  const rows = await prisma.user.findMany({
    where: {
      // 표의 칸 이름은 deletedAt 이다. 화면 쪽 이름(closedAt)을 그대로 쓰면 500 이 난다.
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json({ users: rows });
}
