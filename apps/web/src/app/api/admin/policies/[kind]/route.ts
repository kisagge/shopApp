import { NextResponse } from 'next/server';
import { policySchema, policyKindSchema } from '@shop/contract';
import { ForbiddenError } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { savePolicy } from '~/lib/policies/policy';
import { recordAudit } from '~/lib/audit';
import { revalidatePolicies } from '~/lib/cache';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 약관·개인정보처리방침 저장.
 *
 * **가게가 손님에게 하는 약속을 바꾸는 창구다.** 누가 언제 무엇을 무엇으로 바꿨는지 전후를 감사 로그에 남긴다 — 지난
 * 내용 자체는 방침 이력에 남으므로 여기서는 제목과 시행일만 적는다(본문 전체를 감사 로그에 담으면 로그가 문서가 된다).
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const { kind } = await params;
  const parsedKind = policyKindSchema.safeParse(kind);
  if (!parsedKind.success) {
    return NextResponse.json({ code: 'NOT_FOUND', message: '없는 문서입니다.' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return await invalidJson();
  }

  const parsed = policySchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const { before, after } = await savePolicy(actor, parsedKind.data, parsed.data);
    // 손님 화면이 오래 들고 있던 옛 문서를 계속 보여 주면, 바꿨다는 사실이 시행일에 닿지 않는다
    revalidatePolicies();
    await recordAudit({
      actor,
      action: 'policy.update',
      targetType: 'policy',
      targetId: parsedKind.data,
      ...(before ? { before: { title: before.title, effectiveAt: before.effectiveAt.toISOString() } } : {}),
      after: { title: after.title, effectiveAt: after.effectiveAt.toISOString() },
      request,
    });
    return NextResponse.json({ effectiveAt: after.effectiveAt.toISOString() });
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
