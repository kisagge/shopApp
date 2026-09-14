import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { hasPermission } from '@shop/core';
import { deleteInquiry, InquiryError } from '~/lib/inquiry/write';
import { recordAudit } from '~/lib/audit';
import { unauthorized } from '~/lib/api/respond';

/** 문의 삭제. 본인은 지우고, 운영진이 내리면 표시만 남긴다. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const { id } = await params;

  try {
    await deleteInquiry(actor, id);

    // 남의 글을 내린 경우만 남긴다. 본인 삭제는 감사 대상이 아니다.
    if (hasPermission(actor, 'review:moderate')) {
      await recordAudit({
        actor, action: 'inquiry.delete', targetType: 'inquiry', targetId: id, request,
      });
    }
    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof InquiryError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
