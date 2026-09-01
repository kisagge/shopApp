import { NextResponse } from 'next/server';
import { createReviewSchema } from '@shop/contract';
import { getSessionUser } from '@shop/auth/session';
import { createReview, ReviewError } from '~/lib/reviews/write-review';

/** 리뷰 작성. 산 사람만, 배송이 끝난 뒤, 주문 항목당 하나. */
export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' }, { status: 400 });
  }

  const parsed = createReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        code: 'VALIDATION_FAILED',
        message: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.',
        fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const review = await createReview(user.id, parsed.data);
    return NextResponse.json(review, { status: 201 });
  } catch (error) {
    if (error instanceof ReviewError) {
      return NextResponse.json({ code: error.code, message: error.message }, { status: error.status });
    }
    // 유니크 제약이 동시 요청을 막은 경우
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return NextResponse.json(
        { code: 'ALREADY_REVIEWED', message: '이미 리뷰를 쓴 주문입니다' },
        { status: 409 },
      );
    }
    throw error;
  }
}
