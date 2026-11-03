import { NextResponse } from 'next/server';
import { z } from 'zod';
import { MAX_IMAGE_BYTES } from '@shop/core';
import { getActor } from '@shop/auth/session';
import {
  addProductImage, reorderProductImages,
} from '~/lib/admin/manage-images';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, fileRequired, imageTooLarge, invalidForm, unauthorized } from '~/lib/api/respond';
import { bodyTooLarge } from '~/lib/api/body-size';
import { readBody } from '~/lib/api/read-body';

const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1).max(20) });


/** 이미지 업로드. multipart/form-data 로 파일 하나를 받는다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  // 본문부터 끊는다 — formData() 가 끝나면 이미 다 올라와 있다(한계는 body-size 에 적었다)
  if (bodyTooLarge(request, 1)) return await imageTooLarge();

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
  // 파일별 상한. 본문 자릿수는 위에서 이미 끊었다 — 여기는 한 바이트를 가린다.
  if (file.size > MAX_IMAGE_BYTES) {
    return await imageTooLarge();
  }

  const { id } = await params;
  const altInput = form.get('alt');

  try {
    const image = await addProductImage(
      actor,
      id,
      {
        bytes: new Uint8Array(await file.arrayBuffer()),
        declaredType: file.type,
      },
      typeof altInput === 'string' ? altInput : undefined,
    );

    revalidateCatalog();

    await recordAudit({
      actor,
      action: 'product.image.add',
      targetType: 'product',
      targetId: id,
      after: { imageId: image.id, alt: image.alt, sortOrder: image.sortOrder },
      request,
    });

    return NextResponse.json(image, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}

/** 순서 변경. 전체 id 목록을 순서대로 받는다. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, reorderSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const images = await reorderProductImages(actor, id, parsed.data.orderedIds);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.image.reorder',
      targetType: 'product',
      targetId: id,
      after: { order: images.map((i) => i.id) },
      request,
    });
    return NextResponse.json({ images });
  } catch (error) {
    return await apiError(error);
  }
}
