import { NextResponse } from 'next/server';
import { getSessionUser } from '@shop/auth/session';
import { addressInputSchema } from '@shop/contract';
import { setDefaultAddress, deleteAddress, updateAddress, AddressError } from '~/lib/addresses/manage-address';
import { validationFailed } from '~/lib/i18n/validation';
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

/** 배송지를 고친다. 기본 여부는 바꾸지 않는다(PATCH 가 한다) */
export async function PUT(request: Request, { params }: Params): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return await unauthorized();
  }
  const parsed = addressInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // 어느 칸이 틀렸는지 함께 준다 — 만들 때와 같다
    return validationFailed(parsed.error);
  }
  const { id } = await params;
  try {
    return NextResponse.json({ address: await updateAddress(user.id, id, parsed.data) });
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
