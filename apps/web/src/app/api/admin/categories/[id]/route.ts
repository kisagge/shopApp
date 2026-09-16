import { NextResponse } from 'next/server';
import { canManageCategory } from '@shop/core';
import { updateCategorySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateCategory, deleteCategory, CategoryError } from '~/lib/admin/manage-category';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

function fail(error: unknown): NextResponse | null {
  return error instanceof CategoryError
    ? NextResponse.json({ code: error.code, message: error.message }, { status: error.status })
    : null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

  const parsed = updateCategorySchema.safeParse(body);
  if (!parsed.success) return validationFailed(parsed.error);

  const { id } = await params;

  try {
    const tree = await updateCategory(actor, id, parsed.data);
    await recordAudit({
      actor, action: 'category.update', targetType: 'category', targetId: id,
      after: { ...parsed.data }, request,
    });
    revalidateCatalog();
    return NextResponse.json(tree);
  } catch (error) {
    return fail(error) ?? (() => { throw error; })();
  }
}

/** 비어 있는 갈래만 지운다 — 잘못 만든 것을 되돌리는 용도다 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!canManageCategory(actor)) {
    return await forbidden();
  }

  const { id } = await params;

  try {
    const tree = await deleteCategory(actor, id);
    await recordAudit({
      actor, action: 'category.delete', targetType: 'category', targetId: id, request,
    });
    revalidateCatalog();
    return NextResponse.json(tree);
  } catch (error) {
    return fail(error) ?? (() => { throw error; })();
  }
}
