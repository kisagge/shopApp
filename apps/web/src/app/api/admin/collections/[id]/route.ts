import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { updateCollectionSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import {
  updateCollection, deleteCollection,
} from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { apiError, forbidden, invalidJson, unauthorized } from '~/lib/api/respond';


export async function PATCH(
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

  const parsed = updateCollectionSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { id } = await params;
  try {
    const { before, after } = await updateCollection(actor, id, parsed.data);
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.update', targetType: 'collection', targetId: id,
      before: { slug: before.slug, title: before.title, isActive: before.isActive },
      after: { slug: after.slug, title: after.title, isActive: after.isActive },
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await apiError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!hasPermission(actor, 'collection:write')) {
    return await forbidden();
  }

  const { id } = await params;
  try {
    await deleteCollection(actor, id);
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.delete', targetType: 'collection', targetId: id, request,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return await apiError(error);
  }
}
