import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { setErrorResolved } from '~/lib/queries/admin/errors';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

const schema = z.object({ resolved: z.boolean() });

/**
 * 오류를 처리했다고 표시하거나 되돌린다.
 *
 * 지우지 않는다 — 처리한 오류도 다시 나면 그때 다시 열리고, 그 전에 몇 번 났는지가 남아 있어야
 * "고쳤다고 했는데 또 난다" 를 볼 수 있다.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ fingerprint: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  const { fingerprint } = await params;

  try {
    const result = await setErrorResolved(actor, decodeURIComponent(fingerprint), parsed.data.resolved);
    await recordAudit({
      actor,
      action: parsed.data.resolved ? 'error.resolve' : 'error.reopen',
      targetType: 'error_group',
      targetId: decodeURIComponent(fingerprint),
      request,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    // 없는 지문이면 Prisma 가 P2025 로 답한다
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ code: 'NOT_FOUND', message: '오류 기록을 찾을 수 없습니다.' }, { status: 404 });
    }
    throw error;
  }
}
