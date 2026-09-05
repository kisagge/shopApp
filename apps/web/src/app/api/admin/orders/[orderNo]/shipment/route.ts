import { NextResponse } from 'next/server';
import { registerShipmentSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { registerShipment, ShipmentError } from '~/lib/admin/manage-shipment';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNo: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = registerShipmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { orderNo } = await params;

  try {
    const result = await registerShipment(orderNo, parsed.data, actor);

    // 송장은 고객에게 나가는 정보이고 잘못 넣으면 남의 택배를 조회하게 된다.
    // 누가 언제 무엇을 넣었는지 남긴다.
    await recordAudit({
      actor,
      action: 'order.ship',
      targetType: 'order',
      targetId: result.orderNo,
      after: { carrier: result.carrier, trackingNumber: result.trackingNumber },
      request,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ShipmentError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
