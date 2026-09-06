import { NextResponse } from 'next/server';
import { ForbiddenError, ImageError, MAX_IMAGE_BYTES, hasPermission } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { setCollectionImage, CollectionError } from '~/lib/admin/manage-collection';
import { StorageError } from '~/lib/storage';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { fileRequired, forbidden, imageTooLarge, invalidForm, unauthorized } from '~/lib/api/respond';

/** 기획전 배경 이미지 교체 */
export async function POST(
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return await invalidForm();
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return await fileRequired();
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return await imageTooLarge();
  }

  const alt = form.get('alt');
  const { id } = await params;

  try {
    const collection = await setCollectionImage(
      actor,
      id,
      { bytes: new Uint8Array(await file.arrayBuffer()), declaredType: file.type },
      typeof alt === 'string' ? alt : '',
    );
    revalidateCollections();
    await recordAudit({
      actor, action: 'collection.image', targetType: 'collection', targetId: id,
      after: { imageAlt: collection.imageAlt }, request,
    });
    return NextResponse.json(collection);
  } catch (error) {
    if (error instanceof ImageError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
    }
    if (error instanceof CollectionError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof StorageError) {
      return NextResponse.json(
        { code: error.code, message: error.message },
        { status: error.code === 'NOT_CONFIGURED' ? 503 : 502 },
      );
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
