import { NextResponse } from 'next/server';
import { updateStockSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateStock, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/** 재고 조정. 실사 결과를 덮어쓰는 동작이라 절대값을 받는다. */
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

  const parsed = updateStockSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await updateStock(actor, id, parsed.data);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.stock',
      targetType: 'product',
      targetId: id,
      before: { variants: before },
      after: { variants: after },
      request,
    });
    return NextResponse.json({ updated: after.length, variants: after });
  } catch (error) {
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
