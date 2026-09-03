import { NextResponse } from 'next/server';
import { prisma } from '@shop/db';
import { getActor } from '@shop/auth/session';
import { hasPermission } from '@shop/core';

/** 쿠폰 대상 지정용 상품 찾기. 이름과 id 만 준다. */
export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor || !hasPermission(actor, 'coupon:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (q.length === 0) return NextResponse.json({ products: [] });

  const products = await prisma.product.findMany({
    // 검색용으로 만들어 둔 소문자 컬럼을 그대로 쓴다
    where: { deletedAt: null, searchText: { contains: q.toLowerCase() } },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true },
  });

  return NextResponse.json({ products });
}
