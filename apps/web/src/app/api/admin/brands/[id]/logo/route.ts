import { NextResponse } from 'next/server';
import { ForbiddenError, ImageError, MAX_IMAGE_BYTES } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { setBrandLogo, removeBrandLogo, BrandError } from '~/lib/admin/manage-brand';
import { StorageError } from '~/lib/storage';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { fileRequired, forbidden, imageTooLarge, invalidForm, unauthorized } from '~/lib/api/respond';

function fail(error: unknown): NextResponse | null {
  if (error instanceof ImageError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: 400 });
  }
  if (error instanceof BrandError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof StorageError) {
    // 설정 문제는 500 이 아니다. 고칠 수 있는 사람에게 무엇이 빠졌는지 알려 준다 — 상품 사진과 같다
    return NextResponse.json(
      { code: error.code, message: error.message },
      { status: error.code === 'NOT_CONFIGURED' ? 503 : 502 },
    );
  }
  return null;
}

/**
 * 브랜드 로고 올리기. multipart/form-data 로 파일 하나.
 *
 * 누가 고칠 수 있는지는 서비스가 본다(canEditBrand) — 브랜드가 어느 가맹점 것인지 읽어야
 * 알 수 있다. 매장 브랜드 화면이 로고를 읽으므로 매대 캐시를 턴다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) return await unauthorized();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return await invalidForm();
  }

  const file = form.get('file');
  if (!(file instanceof File)) return await fileRequired();
  // 바이트를 메모리에 올리기 전에 크기부터 본다
  if (file.size > MAX_IMAGE_BYTES) return await imageTooLarge();

  const { id } = await params;
  try {
    const result = await setBrandLogo(actor, id, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredType: file.type,
    });
    revalidateCatalog();
    await recordAudit({
      actor, action: 'brand.logo.set', targetType: 'brand', targetId: id,
      after: { logoUrl: result.logoUrl, replaced: result.replaced }, request,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ForbiddenError) return await forbidden();
    const handled = fail(error);
    if (handled) return handled;
    throw error;
  }
}

/** 로고 떼기. 없으면 그대로 두고 성공으로 답한다 — 두 번 눌러도 같은 결과다 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) return await unauthorized();

  const { id } = await params;
  try {
    const result = await removeBrandLogo(actor, id);
    if (result.removed) {
      revalidateCatalog();
      await recordAudit({ actor, action: 'brand.logo.remove', targetType: 'brand', targetId: id, request });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) return await forbidden();
    const handled = fail(error);
    if (handled) return handled;
    throw error;
  }
}
