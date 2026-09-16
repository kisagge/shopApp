import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { updateBrandSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateBrand, BrandError } from '~/lib/admin/manage-brand';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 이름과 주소를 고친다.
 *
 * **범위는 서비스가 본다.** 가맹점은 자기 브랜드만 고칠 수 있는데, 그 판단에는
 * 브랜드가 어느 가맹점 것인지 읽어야 해서 여기서 미리 거를 수가 없다
 * (canEditBrand). 화면도 같은 규칙으로 단추를 감춘다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const parsed = updateBrandSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { id } = await params;

  try {
    const brand = await updateBrand(actor, id, parsed.data);
    await recordAudit({
      actor, action: 'brand.update', targetType: 'brand', targetId: id,
      after: { name: brand.name, slug: brand.slug }, request,
    });
    revalidateCatalog();
    return NextResponse.json(brand);
  } catch (error) {
    if (error instanceof BrandError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) return await forbidden();
    throw error;
  }
}
