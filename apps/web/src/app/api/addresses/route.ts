import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { addressInputSchema } from '@shop/contract';
import { listAddresses, createAddress, AddressError } from '~/lib/addresses/manage-address';

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  return NextResponse.json({ addresses: await listAddresses(user.id) });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = addressInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 어느 칸이 틀렸는지 함께 준다. "입력이 올바르지 않습니다" 만으로는
    // 사용자가 무엇을 고쳐야 할지 알 수 없다.
    return NextResponse.json(
      {
        code: 'INVALID_INPUT',
        message: '입력을 확인해 주세요.',
        fields: Object.fromEntries(
          parsed.error.issues.map((i) => [i.path.join('.'), i.message]),
        ),
      },
      { status: 400 },
    );
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
