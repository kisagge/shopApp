import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { setDefaultAddress, deleteAddress, AddressError } from '~/lib/addresses/manage-address';

type Params = { params: Promise<{ id: string }> };

/** 기본 배송지로 지정한다 */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await setDefaultAddress(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AddressError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }
  const { id } = await params;
  try {
    await deleteAddress(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AddressError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
