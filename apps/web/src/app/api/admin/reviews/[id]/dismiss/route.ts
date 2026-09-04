import { NextResponse } from 'next/server';
import { getActor } from '@shop/auth/session';
import { assertPermission, ForbiddenError } from '@shop/core';
import { dismissReports, ReviewReportError } from '~/lib/reviews/report';
import { recordAudit } from '~/lib/audit';

/**
 * 신고를 "문제없음" 으로 닫는다. 글은 그대로 둔다.
 *
 * 남의 신고를 무효로 만드는 동작이라 감사 로그를 남긴다 — 운영진이 특정
 * 가맹점의 악평만 골라 살려 두는 것도, 반대도 여기 기록으로 드러난다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const { id } = await params;

  try {
    assertPermission(actor, 'review:moderate');
    const result = await dismissReports(actor.id, id);

    await recordAudit({
      actor,
      action: 'review.reports.dismiss',
      targetType: 'review',
      targetId: id,
      after: { dismissed: result.dismissed },
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    if (error instanceof ReviewReportError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
