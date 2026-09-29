import { NextResponse } from 'next/server';
import { createProductSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createProduct } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/** 상품 등록. 가맹점은 자기 브랜드에만 등록할 수 있다. */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, createProductSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const product = await createProduct(actor, parsed.data);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: 'product.create',
      targetType: 'product',
      targetId: product.id,
      after: parsed.data,
      request,
    });
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return await apiError(error);
  }
}
