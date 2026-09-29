import { NextResponse } from 'next/server';
import { createVariantSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createVariant } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 옵션 추가 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, createVariantSchema);
  if (!parsed.ok) return parsed.response;

  const { id } = await params;

  try {
    const variant = await createVariant(actor, id, parsed.data);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.variant.create',
      targetType: 'product',
      targetId: id,
      after: variant,
      request,
    });
    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}
