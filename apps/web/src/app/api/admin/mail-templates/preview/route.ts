import { NextResponse } from 'next/server';
import { hasPermission } from '@shop/core';
import { updateMailTemplateSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { checkMailWording, MailTemplateError } from '~/lib/mail/templates';
import { previewMail } from '~/lib/mail/preview';
import { validationFailed } from '~/lib/i18n/validation';
import { forbidden, invalidJson, unauthorized } from '~/lib/api/respond';

/**
 * 메일 미리보기 — 저장하지 않은 문구로 실제 메일을 만들어 돌려준다. 보내지도 저장하지도 않는다(그래서 감사 로그도 없다).
 *
 * POST 인 이유는 문구가 길고 한글이라 주소에 싣기 어렵기 때문이다. 아무것도 바꾸지 않는다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }
  if (!hasPermission(actor, 'notification:write')) {
    return await forbidden();
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

  const { kind, locale, subject, heading, lead } = parsed.data;
  const trimmed = { subject: subject?.trim() || null, heading: heading?.trim() || null, lead: lead?.trim() || null };
  const problems = checkMailWording(kind, trimmed);
  if (Object.keys(problems).length > 0) {
    const error = new MailTemplateError(problems);
    return NextResponse.json({ code: 'INVALID_TEMPLATE', message: error.message, problems }, { status: 400 });
  }

  const wording = Object.fromEntries(Object.entries(trimmed).filter(([, v]) => v !== null)) as Record<string, string>;
  const mail = previewMail(kind, locale, wording);
  return NextResponse.json({ subject: mail.subject, html: mail.html, text: mail.text });
}
