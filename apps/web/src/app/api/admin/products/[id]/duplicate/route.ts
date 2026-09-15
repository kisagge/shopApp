import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { duplicateProduct } from '~/lib/admin/duplicate-product';
import { ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/**
 * 상품 복제. 사본은 임시저장이라 매대에 보이지 않아 캐시는 털 것이 없다.
 *
 * 무엇에서 무엇을 만들었는지 감사 로그에 남긴다 — 사본을 게시한 뒤 "이 상품은 어디서 왔나" 를 물을 수 있게.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  const { id } = await params;
  try {
    const copy = await duplicateProduct(actor, id);
    await recordAudit({
      actor,
      action: 'product.duplicate',
      targetType: 'product',
      targetId: copy.id,
      after: copy,
      request,
    });
    return NextResponse.json(copy, { status: 201 });
  } catch (error) {
    if (error instanceof ProductError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
