import { NextResponse } from 'next/server';
import { ForbiddenError, canCreateBrand } from '@shop/core';
import { createBrandSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createBrand, BrandError } from '~/lib/admin/manage-brand';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/** 자사 브랜드를 만든다. 가맹점 브랜드는 입점 승인이 만든다. */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  /*
   * 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가 입력값
   * 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
   */
  if (!canCreateBrand(actor)) {
    return await forbidden();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = createBrandSchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  try {
    const brand = await createBrand(actor, parsed.data);
    await recordAudit({
      actor, action: 'brand.create', targetType: 'brand', targetId: brand.id,
      after: { name: brand.name, slug: brand.slug }, request,
    });
    // 매대의 브랜드 목록이 이 값을 읽는다
    revalidateCatalog();
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    if (error instanceof BrandError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) return await forbidden();
    throw error;
  }
}
