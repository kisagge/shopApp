import { NextResponse } from 'next/server';
import { prisma } from '@shop/db';
import { getActor } from '@shop/auth/session';
import { hasPermission, isVisibleStatus, merchantScope } from '@shop/core';
import { forbidden } from '~/lib/api/respond';

/**
 * 운영 화면에서 상품을 골라 담을 때 쓰는 검색.
 *
 * 쿠폰 대상 지정과 기획전 담기가 **같은 일을 한다** — 이름으로 찾아서 하나를
 * 고른다. 처음에는 창구를 따로 뒀는데, 두 벌인 채 두면 다음 사람이 어느 쪽에
 * 붙일지 헷갈리고 한쪽만 고쳐진다.
 *
 * 권한은 `product:read` 다. "무엇을 골라 담느냐" 가 아니라 **"상품 목록을
 * 볼 수 있느냐"** 가 이 창구가 하는 일이고, 실제로 담을 수 있는지는 담는
 * 창구가 다시 본다. 대신 **가맹점 범위를 건다** — 예전 쿠폰용 창구는 운영진
 * 전용이라 범위를 걸지 않았는데, 그대로 열면 가맹점이 남의 브랜드 상품
 * 이름을 훑을 수 있다.
 *
 * **내려간 상품도 준다.** 다시 올릴 예정으로 미리 담아 두는 것이 정상적인
 * 편집이고, 여기서 감추면 운영자는 왜 그 상품이 안 보이는지 알 수 없다.
 * 지운 상품만 뺀다.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor || !hasPermission(actor, 'product:read')) {
    return await forbidden();
  }

  const scope = merchantScope(actor);
  if (scope === undefined) {
    return await forbidden();
  }

  const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';

  const rows = await prisma.product.findMany({
    where: {
      deletedAt: null,
      // 검색용으로 만들어 둔 소문자 컬럼을 그대로 쓴다
      ...(q ? { searchText: { contains: q } } : {}),
      ...(scope === null ? {} : { brand: { merchantId: scope } }),
    },
    orderBy: [{ soldCount: 'desc' }, { name: 'asc' }],
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
