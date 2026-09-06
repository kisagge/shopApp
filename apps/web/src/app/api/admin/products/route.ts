import { NextResponse } from 'next/server';
import { createProductSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createProduct, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/** 상품 등록. 가맹점은 자기 브랜드에만 등록할 수 있다. */
export async function POST(request: Request): Promise<NextResponse> {
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

  const parsed = createProductSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

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
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
