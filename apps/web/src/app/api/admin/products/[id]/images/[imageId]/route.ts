import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ImageError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { deleteProductImage, updateImageAlt } from '~/lib/admin/manage-images';
import { ProductError } from '~/lib/admin/manage-product';
import { StorageError } from '~/lib/storage';
import { recordAudit } from '~/lib/audit';

const altSchema = z.object({ alt: z.string().trim().min(1, '대체 텍스트를 입력해 주세요').max(200) });

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
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = altSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'ALT_REQUIRED', message: parsed.error.issues[0]?.message ?? '대체 텍스트를 입력해 주세요' },
      { status: 400 },
    );
  }

  const { id, imageId } = await params;

  try {
    const image = await updateImageAlt(actor, id, imageId, parsed.data.alt);
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
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id, imageId } = await params;

  try {
    const { remaining } = await deleteProductImage(actor, id, imageId);
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
