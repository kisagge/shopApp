import { NextResponse } from 'next/server';
import { updateStockSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { updateStock, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';

/** 재고 조정. 실사 결과를 덮어쓰는 동작이라 절대값을 받는다. */
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

  const parsed = updateStockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '재고 값을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const { before, after } = await updateStock(actor, id, parsed.data);
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
