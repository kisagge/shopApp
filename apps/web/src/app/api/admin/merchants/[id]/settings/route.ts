import { NextResponse } from 'next/server';
import { merchantBusinessSchema, merchantSettingsSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import {
  MerchantSettingsError, updateMerchantBusiness, updateMerchantSettings,
} from '~/lib/admin/merchant-settings';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 가맹점 연락처와 정산 계좌(PUT), 사업자 정보(PATCH).
 *
 * **창구를 둘로 나눈 것이 곧 권한을 나눈 것이다.** 가맹점은 자기 연락처와 계좌를 고치고, 상호·사업자등록번호·대표자는
 * 운영진만 고친다 — 한 창구로 받아 놓고 안에서 칸을 골라 거르면, 화면이 안 보여 주는 칸을 요청에 끼워 넣는 길이 남는다.
 *
 * 둘 다 감사 로그에 남는다. **계좌번호는 뒤 네 자리만 남긴다** — 무엇이 바뀌었는지는 그것으로 알고,
 * 로그가 새는 순간의 피해는 훨씬 작다.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const parsed = merchantSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await updateMerchantSettings(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'merchant.updateSettings',
      targetType: 'merchant',
      targetId: id,
      before,
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await handle(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

  const parsed = merchantBusinessSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { id } = await params;

  try {
    const { before, after } = await updateMerchantBusiness(actor, id, parsed.data);
    await recordAudit({
      actor,
      action: 'merchant.updateBusiness',
      targetType: 'merchant',
      targetId: id,
      before,
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    return await handle(error);
  }
}

async function handle(error: unknown): Promise<NextResponse> {
  if (error instanceof MerchantSettingsError) {
    return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof ForbiddenError) {
    return await forbidden();
  }
  throw error;
}
