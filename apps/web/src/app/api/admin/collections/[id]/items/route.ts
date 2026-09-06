import { NextResponse } from 'next/server';
import { ForbiddenError, hasPermission } from '@shop/core';
import { setCollectionItemsSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { setCollectionItems, CollectionError } from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = setCollectionItemsSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

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
    if (error instanceof CollectionError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
