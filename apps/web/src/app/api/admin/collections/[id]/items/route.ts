import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { setCollectionItemsSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { setCollectionItems } from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 담긴 상품을 통째로 새로 쓴다. 보낸 순서가 곧 진열 순서다. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'collection:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, setCollectionItemsSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;
  try {
    const collection = await setCollectionItems(actor, id, parsed.data.productIds);
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.items', targetType: 'collection', targetId: id,
      after: { productIds: parsed.data.productIds }, request,
    });
    return NextResponse.json(collection);
  } catch (error) {
    return await apiError(error);
  }
}
