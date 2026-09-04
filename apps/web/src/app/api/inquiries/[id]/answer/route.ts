import { NextResponse } from 'next/server';
import { answerInquirySchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { answerInquiry, InquiryError } from '~/lib/inquiry/write';
import { notifyInquiryAnswered } from '~/lib/inquiry/notify';

/**
 * 문의 답변.
 *
 * 답변을 저장한 뒤 알린다. **메일이 실패해도 답변은 남는다** — 알림이
 * 안 갔다고 답변을 무를 이유가 없다.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  const parsed = answerInquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const answered = await answerInquiry(actor, id, parsed.data);
    await notifyInquiryAnswered(answered);
    return NextResponse.json({ answered: true });
  } catch (error) {
    if (error instanceof InquiryError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    throw error;
  }
}
