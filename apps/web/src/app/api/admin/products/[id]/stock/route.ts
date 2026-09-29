import { NextResponse } from 'next/server';
import { updateStockSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateStockAudited } from '~/lib/admin/manage-product';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 재고 조정. 실사 결과를 덮어쓰는 동작이라 절대값을 받는다. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, updateStockSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const { after } = await updateStockAudited(actor, id, parsed.data, request);
    revalidateCatalog();
    return NextResponse.json({ updated: after.length, variants: after });
  } catch (error) {
    return await apiError(error);
  }
}
