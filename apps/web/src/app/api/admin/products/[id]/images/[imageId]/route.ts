import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ImageError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { deleteProductImage, updateImageAlt } from '~/lib/admin/manage-images';
import { ProductError } from '~/lib/admin/manage-product';
import { StorageError } from '~/lib/storage';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

const altSchema = z.object({
  alt: z.string().trim().min(1, 'valid.altTextRequired').max(200, 'valid.tooLongChars'),
});

function fail(error: unknown): NextResponse | null {
  if (error instanceof ImageError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
  }
  if (error instanceof ProductError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof StorageError) {
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.code === 'NOT_CONFIGURED' ? 503 : 502 },
    );
  }
  return null;
}

/** 대체 텍스트 수정 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = altSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id, imageId } = await params;

  try {
    const image = await updateImageAlt(actor, id, imageId, parsed.data.alt);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.image.alt',
      targetType: 'product',
      targetId: id,
      after: { imageId, alt: image.alt },
      request,
    });
    return NextResponse.json(image);
  } catch (error) {
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}

/** 이미지 삭제 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const { id, imageId } = await params;

  try {
    const { remaining } = await deleteProductImage(actor, id, imageId);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.image.delete',
      targetType: 'product',
      targetId: id,
      before: { imageId },
      after: { remaining: remaining.length },
      request,
    });
    return NextResponse.json({ images: remaining });
  } catch (error) {
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}
