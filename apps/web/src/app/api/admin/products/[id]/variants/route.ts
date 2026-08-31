import { NextResponse } from 'next/server';
import { createVariantSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { createVariant, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';

/** 옵션 추가 */
export async function POST(
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

  const parsed = createVariantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        message: '옵션 정보를 확인해 주세요.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const variant = await createVariant(actor, id, parsed.data);
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
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
