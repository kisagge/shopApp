import { NextResponse } from 'next/server';
import { MAX_IMAGE_BYTES, hasPermission } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { setCollectionImage } from '~/lib/admin/manage-collection';
import { recordAudit } from '~/lib/audit';
import { revalidateCollections } from '~/lib/cache';
import { apiError, fileRequired, forbidden, imageTooLarge, invalidForm, unauthorized } from '~/lib/api/respond';

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
    return await apiError(error);
  }
}
