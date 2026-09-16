import { NextResponse } from 'next/server';
import { canManageCategory } from '@shop/core';
import { createCategorySchema, reorderCategorySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createCategory, reorderCategories, CategoryError } from '~/lib/admin/manage-category';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

function fail(error: unknown): NextResponse | null {
  return error instanceof CategoryError
    ? NextResponse.json({ code: error.code, message: error.message }, { status: error.status })
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  /*
   * 권한을 본문 검증보다 먼저 본다. 순서가 반대면 권한 없는 사용자가 입력값
   * 오류를 돌려받아, 무엇을 보내야 통과하는지 알게 된다.
   */
  if (!canManageCategory(actor)) {
    return await forbidden();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = createCategorySchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  try {
    const tree = await createCategory(actor, parsed.data);
    await recordAudit({
      actor, action: 'category.create', targetType: 'category', targetId: parsed.data.slug,
      after: { name: parsed.data.name, parentId: parsed.data.parentId }, request,
    });
    // 머리 메뉴와 목록 필터가 이 값을 읽는다
    revalidateCatalog();
    return NextResponse.json(tree, { status: 201 });
  } catch (error) {
    return fail(error) ?? (() => { throw error; })();
  }
}

/** 같은 부모 안에서 순서를 바꾼다 — 머리 메뉴가 그 순서로 선다 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!canManageCategory(actor)) {
    return await forbidden();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = reorderCategorySchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  try {
    const tree = await reorderCategories(actor, parsed.data.parentId, parsed.data.orderedIds);
    await recordAudit({
      actor, action: 'category.reorder', targetType: 'category',
      targetId: parsed.data.parentId ?? 'root',
      after: { orderedIds: parsed.data.orderedIds }, request,
    });
    revalidateCatalog();
    return NextResponse.json(tree);
  } catch (error) {
    return fail(error) ?? (() => { throw error; })();
  }
}
