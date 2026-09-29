import { NextResponse } from 'next/server';
import { canManageCategory } from '@shop/core';
import { updateCategorySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateCategory, deleteCategory } from '~/lib/admin/manage-category';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';


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

  const parsed = await readBody(request, updateCategorySchema);
  if (!parsed.ok) return parsed.response;

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
    return await apiError(error);
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
    return await apiError(error);
  }
}
