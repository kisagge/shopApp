import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActor } from '@shop/auth/session';
import { deleteProductImage, updateImageAlt } from '~/lib/admin/manage-images';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

const altSchema = z.object({
  alt: z.string().trim().min(1, 'valid.altTextRequired').max(200, 'valid.tooLongChars'),
});


/** 대체 텍스트 수정 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, altSchema);
  if (!parsed.ok) return parsed.response;

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
    return await apiError(error);
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
    return await apiError(error);
  }
}
