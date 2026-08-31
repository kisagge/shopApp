import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { reconcilePoints } from '~/lib/admin/reconcile-points';
import { recordAudit } from '~/lib/audit';

/** 포인트 잔액 대사 실행. 원장 → 잔액 방향으로만 고친다. */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: '로그인이 필요합니다.' }, { status: 401 });
  }

  try {
    const result = await reconcilePoints(actor, { fix: true });

    // 고칠 것이 없으면 기록도 남기지 않는다. 아무 일도 없었다는 줄로
    // 감사 로그를 채우면 정작 봐야 할 줄이 묻힌다.
    if (result.fixed > 0) {
      await recordAudit({
        actor,
        action: 'points.reconcile',
        targetType: 'user',
        targetId: `${result.fixed}건`,
        after: {
          fixed: result.fixed,
          overCredited: result.overCredited,
          users: result.mismatches.map((m) => ({
            userId: m.userId,
            from: m.storedBalance,
            to: m.ledgerBalance,
          })),
        },
        request,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ code: 'FORBIDDEN', message: '권한이 없습니다.' }, { status: 403 });
    }
    throw error;
  }
}
