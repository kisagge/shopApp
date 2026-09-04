import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { reviewProductSchema } from '@shop/contract';
import { reviewProduct, ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';

/**
 * 게시 검수 결정.
 *
 * 매대에 무엇이 오르는지를 정하는 동작이라 감사 로그를 남긴다 — 특정
 * 가맹점 상품만 계속 반려하는 것도, 검수 없이 올리는 것도 여기서 드러난다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = reviewProductSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const { before, after } = await reviewProduct(actor, id, parsed.data);

    await recordAudit({
      actor,
      action: parsed.data.approve ? 'product.publish.approve' : 'product.publish.reject',
      targetType: 'product',
      targetId: after.id,
      before: { status: before.status },
      after: { status: after.status, rejection: after.publishRejection },
      request,
    });
    return NextResponse.json({ product: after });
  } catch (error) {
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
