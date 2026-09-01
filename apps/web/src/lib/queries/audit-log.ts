import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor, type UserRole } from '@shop/core';

/**
 * 감사 로그 조회.
 *
 * **관리자 이상만 본다.** 가맹점에게도 자기 계정의 기록만 보여 줄 수는 있지만,
 * 관리자가 그 가맹점 상품에 한 조치는 actor 가 관리자라 merchantId 가 비어
 * 있어 보이지 않는다. 절반만 보이는 감사 로그는 없느니만 못하다.
 *
 * 목록은 커서 페이지네이션이다. 이벤트·감사 테이블은 계속 자라므로 offset 은
 * 뒤로 갈수록 느려지고, 조회하는 사이 새 행이 끼어들면 같은 행이 두 번 나온다.
 */

export interface AuditLogRow {
  readonly id: string;
  readonly actorName: string;
  /** 배치가 한 동작이면 이메일이 없다 */
  readonly actorEmail: string | null;
  readonly isSystem: boolean;
  readonly actorRole: UserRole;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly createdAt: Date;
}

export interface AuditLogPage {
  readonly rows: readonly AuditLogRow[];
  /** 다음 쪽 커서. null 이면 마지막 쪽 */
  readonly nextCursor: string | null;
  readonly filters: {
    readonly actions: readonly string[];
    readonly targetTypes: readonly string[];
  };
}

export interface AuditLogQuery {
  readonly action?: string | undefined;
  readonly targetType?: string | undefined;
  readonly cursor?: string | undefined;
  readonly take?: number;
}

const MAX_TAKE = 50;

export async function getAuditLogs(actor: Actor, query: AuditLogQuery = {}): Promise<AuditLogPage> {
  assertPermission(actor, 'user:read');

  const take = Math.min(query.take ?? 25, MAX_TAKE);

  const where = {
    ...(query.action ? { action: query.action } : {}),
    ...(query.targetType ? { targetType: query.targetType } : {}),
  };

  const rows = await prisma.adminAuditLog.findMany({
    where,
    // id 를 함께 정렬해야 같은 밀리초에 들어온 행의 순서가 고정된다.
    // 순서가 흔들리면 커서가 행을 건너뛰거나 되풀이한다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: {
      id: true, actorRole: true, action: true, targetType: true, targetId: true,
      before: true, after: true, createdAt: true, actorLabel: true,
      actor: { select: { name: true, email: true } },
    },
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  // 필터 선택지는 실제로 쌓인 값에서 뽑는다. 상수로 두면 새 동작을 추가할 때
  // 목록에 넣는 것을 잊는다.
  const [actions, targetTypes] = await Promise.all([
    prisma.adminAuditLog.findMany({
      distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' }, take: 100,
    }),
    prisma.adminAuditLog.findMany({
      distinct: ['targetType'], select: { targetType: true }, orderBy: { targetType: 'asc' }, take: 50,
    }),
  ]);

  return {
    rows: page.map((r) => ({
      id: r.id,
      // 배치는 사용자가 없으므로 남겨 둔 이름을 쓴다
      actorName: r.actor?.name ?? r.actorLabel ?? '(알 수 없음)',
      actorEmail: r.actor?.email ?? null,
      isSystem: r.actor === null,
      actorRole: r.actorRole,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      before: r.before,
      after: r.after,
      createdAt: r.createdAt,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    filters: {
      actions: actions.map((a) => a.action),
      targetTypes: targetTypes.map((t) => t.targetType),
    },
  };
}
