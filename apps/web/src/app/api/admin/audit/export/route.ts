import { NextResponse } from 'next/server';
import { ForbiddenError, OrderSearchError, USER_ROLE_LABEL, csvDocument } from '@shop/core';
import { getActor } from '@shop/auth/session';
import { exportAuditLogs, AuditExportTooLargeError } from '~/lib/queries/audit-log';
import { actionLabel, targetLabel } from '~/lib/admin/audit-labels';
import { recordAudit } from '~/lib/audit';
import { enforceRateLimit } from '~/lib/rate-limit';
import { forbidden, unauthorized } from '~/lib/api/respond';

/**
 * 감사 로그 내려받기(CSV).
 *
 * **화면과 같은 조건으로 나간다** — 주소의 action·targetType·actor·from·to 를 그대로 받고, 조건을 만드는 함수도
 * 목록과 하나다(auditLogWhere).
 *
 * **내려받은 것도 감사 로그에 남긴다.** 이 파일에는 누가 누구의 권한을 바꿨고 왜 정지했는지가 들어 있다. 가져간
 * 사람이 기록에 안 남으면 감사 로그를 빼 가는 길이 감사되지 않는다.
 *
 * GET 이 아니라 POST 다 — 링크 미리 받기만으로 파일이 만들어지고 기록이 쌓이면 안 된다(주문 내려받기와 같다).
 */

const HEADER = [
  '시각', '행위자', '이메일', '당시 역할', '동작', '동작 코드', '대상', '대상 코드', '대상 ID', '변경 전', '변경 후',
] as const;

const kst = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** 변경 전후는 JSON 한 칸으로. 줄바꿈 없이 적어야 엑셀에서 한 줄이 한 기록으로 보인다 */
const json = (value: unknown): string => (value === null || value === undefined ? '' : JSON.stringify(value));

export async function POST(request: Request): Promise<Response> {
  const actor = await getActor(request.headers);
  if (!actor) {
    return await unauthorized();
  }

  const limited = await enforceRateLimit('auditExport', request, actor.id);
  if (limited) return limited;

  const url = new URL(request.url);
  const pick = (key: string) => url.searchParams.get(key) || undefined;
  const filter = {
    action: pick('action'),
    targetType: pick('targetType'),
    actor: pick('actor'),
    from: pick('from'),
    to: pick('to'),
  };

  try {
    const rows = await exportAuditLogs(actor, filter);

    await recordAudit({
      actor,
      action: 'audit.export',
      targetType: 'audit',
      targetId: 'export',
      after: { rows: rows.length, ...filter },
      request,
    });

    const body = csvDocument(
      HEADER,
      rows.map((r) => [
        kst.format(r.createdAt),
        r.actorName,
        r.actorEmail ?? '',
        USER_ROLE_LABEL[r.actorRole] ?? r.actorRole,
        actionLabel(r.action),
        r.action,
        targetLabel(r.targetType),
        r.targetType,
        r.targetId,
        json(r.before),
        json(r.after),
      ]),
    );

    const stamp = kst.format(new Date()).replace(/[^\d]/g, '').slice(0, 12);
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="audit-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`감사로그-${stamp}.csv`)}`,
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuditExportTooLargeError) {
      return NextResponse.json({ code: 'EXPORT_TOO_LARGE', message: error.message }, { status: 413 });
    }
    if (error instanceof OrderSearchError) {
      return NextResponse.json({ code: 'INVALID_RANGE', message: error.message }, { status: 400 });
    }
    if (error instanceof ForbiddenError) {
      return await forbidden();
    }
    throw error;
  }
}
