import { NextResponse } from 'next/server';
import { returnAddressInputSchema } from '@shop/contract';
import { PLATFORM_RETURN_ADDRESS_ID } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { updateReturnAddress } from '~/lib/orders/return-address';
import { recordAudit } from '~/lib/audit';
import { apiError, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 반품지 등록·수정. `owner` 는 가맹점 id, 또는 자사 상품을 받는 플랫폼 반품지면 `platform`.
 *
 * 가맹점은 자기 반품지만, 운영진은 가맹점 반품지와 (배송 정책 권한이 있으면) 플랫폼 반품지를 고친다(core
 * canEditReturnAddress). **주소를 바꾸면 그다음 승인부터 손님이 보내는 곳이 바뀐다** — 누가 무엇을 무엇으로 바꿨는지
 * 전후를 남긴다.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ owner: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, returnAddressInputSchema);
  if (!parsed.ok) return parsed.response;

  const { owner } = await params;
  const merchantId = owner === PLATFORM_RETURN_ADDRESS_ID ? null : owner;

  try {
    const { before, after } = await updateReturnAddress(actor, merchantId, parsed.data);
    await recordAudit({
      actor,
      action: 'returnAddress.update',
      targetType: 'return_address',
      targetId: owner,
      before,
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await apiError(error);
  }
}
