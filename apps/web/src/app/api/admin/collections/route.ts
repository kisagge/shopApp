import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { createCollectionSchema, reorderCollectionSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import {
  createCollection, reorderCollections,
} from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';


export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'collection:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, createCollectionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const collection = await createCollection(actor, parsed.data);
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.create', targetType: 'collection', targetId: collection.id,
      after: { slug: collection.slug, title: collection.title }, request,
    });
    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}

/** 순서 변경 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!hasPermission(actor, 'collection:write')) {
    return await forbidden();
  }

  const parsed = await readBody(request, reorderCollectionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const collections = await reorderCollections(actor, parsed.data.orderedIds);
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.reorder', targetType: 'collection', targetId: 'all',
      after: { order: collections.map((c) => c.id) }, request,
    });
    return NextResponse.json({ collections });
  } catch (error) {
    return await apiError(error);
  }
}
