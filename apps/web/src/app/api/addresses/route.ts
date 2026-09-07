import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { enforceRateLimit } from '~/lib/rate-limit';
import { addressInputSchema } from '@shop/contract';
import { listAddresses, createAddress, AddressError } from '~/lib/addresses/manage-address';
import { validationFailed } from '~/lib/i18n/validation';
import { unauthorized } from '~/lib/api/respond';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  return NextResponse.json({ addresses: await listAddresses(user.id) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }

  /*
   * **배송지에는 (사용자, 주소) 유니크가 없다.** 찜이나 재입고와 달리 같은
   * 요청을 반복하면 줄이 그만큼 쌓인다 — 주소록이 부풀면 주문서의 배송지
   * 고르는 목록이 못 쓰게 된다.
   */
  const limited = await enforceRateLimit('write', request, user.id);
  if (limited) return limited;

  const parsed = addressInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 어느 칸이 틀렸는지 함께 준다. "입력이 올바르지 않습니다" 만으로는
    // 사용자가 무엇을 고쳐야 할지 알 수 없다.
    return validationFailed(parsed.error);
  }

  try {
    return NextResponse.json({ address: await createAddress(user.id, parsed.data) }, { status: 201 });
  } catch (error) {
    if (error instanceof AddressError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
