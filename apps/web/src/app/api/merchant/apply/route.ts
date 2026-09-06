import { NextResponse } from 'next/server';
import { applyMerchantSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { applyForMerchant, MerchantApplicationError } from '~/lib/merchant/apply';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

/**
 * 입점 신청.
 *
 * 로그인한 사람만 낼 수 있다. 익명으로 열어 두면 심사할 대상이 사람이
 * 아니라 이메일 주소가 되고, 승인해도 누구의 계정을 올려야 할지 모른다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = applyMerchantSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    return NextResponse.json({ application: await applyForMerchant(actor, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof MerchantApplicationError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
