import { NextResponse } from 'next/server';
import { archiveProductSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { archiveProduct } from '~/lib/admin/archive-product';
import { ProductError } from '~/lib/admin/manage-product';
import { recordAudit } from '~/lib/audit';
import { revalidateCatalog } from '~/lib/cache';
import { enforceRateLimit } from '~/lib/rate-limit';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 상품 보관·되돌리기. 매대·검색에서 빠지거나 돌아오므로 카탈로그 캐시를 턴다.
 *
 * 누가 언제 보관했는지 감사 로그에 남긴다 — 가맹점이 "내 상품이 왜 안 보이냐" 고 물으면 이것으로 답한다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, actor.id);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = archiveProductSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await archiveProduct(actor, id, parsed.data.action);
    revalidateCatalog();
    await recordAudit({
      actor,
      action: parsed.data.action === 'ARCHIVE' ? 'product.archive' : 'product.restore',
      targetType: 'product',
      targetId: id,
      before,
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
