import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { setDefaultAddress, deleteAddress, AddressError } from '~/lib/addresses/manage-address';
import { unauthorized } from '~/lib/api/respond';

type Params = { params: Promise<{ id: string }> };

/** 기본 배송지로 지정한다 */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
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
    return await unauthorized();
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
