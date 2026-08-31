import { NextResponse } from 'next/server';
import { updateProductSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateProduct, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';

/** 상품 수정. 재고는 여기서 못 고친다 — /stock 으로 따로 간다. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = updateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        message: '입력값을 확인해 주세요.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const { before, after } = await updateProduct(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'product.update',
      targetType: 'product',
      targetId: id,
      // 변경 전후를 함께 남긴다. 가격을 언제 누가 내렸는지는 정산 분쟁에서
      // 실제로 필요해진다.
      before: {
        slug: before.slug, name: before.name, listPrice: before.listPrice,
        salePrice: before.salePrice, status: before.status,
        brandId: before.brandId, categoryId: before.categoryId,
      },
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
