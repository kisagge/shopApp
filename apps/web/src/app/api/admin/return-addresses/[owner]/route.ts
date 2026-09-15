import { NextResponse } from 'next/server';
import { returnAddressInputSchema } from '@shop/contract';
import { ForbiddenError, PLATFORM_RETURN_ADDRESS_ID } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { ReturnAddressError, updateReturnAddress } from '~/lib/orders/return-address';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = returnAddressInputSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

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
    if (error instanceof ReturnAddressError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
