import { NextResponse } from 'next/server';
import { ForbiddenError } from '@shop/core';
import { updateNotificationTemplateSchema } from '@shop/contract';
import { getActor } from '@shop/auth/session';
import { saveNotificationTemplate, TemplateError } from '~/lib/notifications/templates';
import { recordAudit } from '~/lib/audit';
import { forbidden, unauthorized } from '~/lib/api/respond';
import { readBody } from '~/lib/api/read-body';

/**
 * 알림 문구 템플릿 저장 · 되돌리기.
 *
 * **이미 온 알림도 새 문구로 읽힌다.** 알림에는 문장이 아니라 값만 저장하기 때문이다 — 그래서 전후 문구를 감사 로그에
 * 남긴다. 캐시는 털 것이 없다: 알림함은 요청마다 읽는다.
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const parsed = await readBody(request, updateNotificationTemplateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { before, after } = await saveNotificationTemplate(actor, parsed.data);
    await recordAudit({
      actor,
      action: after === null ? 'notification.template.reset' : 'notification.template.update',
      targetType: 'notification_template',
      targetId: `${parsed.data.kind}:${parsed.data.locale}`,
      before: { body: before },
      after: { body: after },
      request,
    });
    return NextResponse.json({ body: after });
  } catch (error) {
    if (error instanceof TemplateError) {
      return NextResponse.json(
        { code: 'INVALID_TEMPLATE', message: error.message, problems: error.problems },
        { status: 400 },
      );
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
