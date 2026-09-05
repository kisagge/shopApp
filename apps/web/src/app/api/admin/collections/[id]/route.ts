import { NextResponse } from 'next/server';
import { ForbiddenError, hasPermission } from '@shop/core';
import { updateCollectionSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import {
  updateCollection, deleteCollection, CollectionError,
} from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';

function fail(error: unknown): NextResponse | null {
  if (error instanceof CollectionError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  // 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가
  // 입력값 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
  if (!hasPermission(actor, 'collection:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
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
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  if (!hasPermission(actor, 'collection:write')) {
    return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
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
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}
