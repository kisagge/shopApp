import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { updateMailTemplateSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { saveMailTemplate, MailTemplateError } from '~/lib/mail/templates';
import { recordAudit } from '~/lib/audit';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 메일 문구 템플릿 저장. 칸을 비우면(null) 그 칸은 기본 문구, 다 비우면 기본으로 되돌린다.
 *
 * 손님에게 우리 이름으로 나가는 말이라 전후를 감사 로그에 남긴다.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
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
  const parsed = updateMailTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  try {
    const { before, after } = await saveMailTemplate(actor, parsed.data);
    const reset = after.subject === null && after.heading === null && after.lead === null;
    await recordAudit({
      actor,
      action: reset ? 'mail.template.reset' : 'mail.template.update',
      targetType: 'mail_template',
      targetId: `${parsed.data.kind}:${parsed.data.locale}`,
      before,
      after,
      request,
    });
    return NextResponse.json(after);
  } catch (error) {
    if (error instanceof MailTemplateError) {
      return NextResponse.json({ code: 'INVALID_TEMPLATE', message: error.message, problems: error.problems }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
