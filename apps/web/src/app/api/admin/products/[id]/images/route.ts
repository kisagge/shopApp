import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ImageError, MAX_IMAGE_BYTES } from '@shop/core';
import { getActor } from '@shop/auth/session';
import {
  addProductImage, reorderProductImages,
} from '~/lib/admin/manage-images';
import { ProductError } from '~/lib/admin/manage-product';
import { StorageError } from '~/lib/storage';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';

const reorderSchema = z.object({ orderedIds: z.array(z.string()).min(1).max(20) });

function fail(error: unknown): NextResponse | null {
  if (error instanceof ImageError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
  }
  if (error instanceof ProductError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof StorageError) {
    // 설정 문제는 500 이 아니다. 고칠 수 있는 사람에게 무엇이 빠졌는지 알려 준다.
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.code === 'NOT_CONFIGURED' ? 503 : 502 },
    );
  }
  return null;
}

/** 이미지 업로드. multipart/form-data 로 파일 하나를 받는다. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { code: 'INVALID_FORM', message: '업로드 형식을 읽을 수 없습니다.' },
      { status: 400 },
    );
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json(
      { code: 'FILE_REQUIRED', message: '이미지 파일을 선택해 주세요.' },
      { status: 400 },
    );
  }
  // 바이트를 메모리에 올리기 전에 크기를 먼저 본다. 5MB 제한을 통과할 수 없는
  // 파일을 굳이 다 읽을 이유가 없다.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { code: 'TOO_LARGE', message: '이미지는 5MB 를 넘을 수 없습니다' },
      { status: 400 },
    );
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
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}

/** 순서 변경. 전체 id 목록을 순서대로 받는다. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '이미지 순서를 확인해 주세요.' },
      { status: 400 },
    );
  }

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
    const response = fail(error);
    if (response) return response;
    throw error;
  }
}
