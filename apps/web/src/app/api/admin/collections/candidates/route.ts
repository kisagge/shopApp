import { NextResponse } from 'next/server';
import { hasPermission, isVisibleStatus } from '@shop/core';
import { prisma } from '@shop/db';
import { getActor } from '@shop/auth/session';

/**
 * 기획전에 담을 상품 후보.
 *
 * **내려간 상품도 준다.** 다시 올릴 예정으로 미리 담아 두는 것이 정상적인
 * 편집이고, 여기서 감추면 운영자는 왜 그 상품이 안 보이는지 알 수 없다.
 * 지운 상품만 뺀다.
 *
 * 정적 구간(`candidates`)이 `[id]` 보다 먼저 잡히므로 이 경로가 상품 수정
 * 창구를 가리지 않는다 — 그래도 헷갈리지 않게 이름을 다르게 두었다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(actor, 'collection:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase();

  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      ...(q ? { searchText: { contains: q } } : {}),
    },
    orderBy: [{ soldCount: 'desc' }, { id: 'desc' }],
    take: 20,
    select: {
      id: true, slug: true, name: true, status: true, publishedAt: true,
      brand: { select: { name: true } },
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
    },
  });

  return NextResponse.json({
    products: rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brandName: p.brand.name,
      imageUrl: p.images[0]?.url ?? null,
      onDisplay: p.publishedAt !== null && isVisibleStatus(p.status),
    })),
  });
}
