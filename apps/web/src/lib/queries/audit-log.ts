import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, offsetOf, readDateRange, type Actor, type UserRole } from '@shop/core';

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
  /** 조건에 맞는 전체 줄 수. 쪽 수가 이 값에서 나온다 */
  readonly total: number;
  readonly filters: {
    readonly actions: readonly string[];
    readonly targetTypes: readonly string[];
    /** 기록을 남긴 적이 있는 사람. 배치(사용자 없음)는 `SYSTEM_ACTOR` 한 칸으로 묶는다 */
    readonly actors: readonly { readonly value: string; readonly label: string }[];
  };
}

/** 행위자 필터에서 "자동 실행(배치)" 을 가리키는 값. 사용자 id(cuid)와 겹칠 수 없다 */
export const SYSTEM_ACTOR = 'system';

export interface AuditLogFilter {
  readonly action?: string | undefined;
  readonly targetType?: string | undefined;
  /**
   * 그 대상 하나에 무슨 일이 있었나.
   *
   * **종류만으로는 답할 수 없는 물음이다.** targetType 이 'merchant' 면 모든
   * 가맹점의 기록이 섞여 나온다 — "이 가맹점이 왜 정지됐나" 를 보려면 id 로
   * 좁혀야 한다. 가맹점 상세 화면이 이것을 쓴다.
   */
  readonly targetId?: string | undefined;
  /** 사용자 id, 또는 SYSTEM_ACTOR */
  readonly actor?: string | undefined;
  /** 'YYYY-MM-DD' (KST, 그날 포함) */
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

export interface AuditLogQuery extends AuditLogFilter {
  readonly page?: number;
  readonly take?: number;
}

/**
 * 감사 로그의 조회 조건.
 *
 * **목록과 내려받기가 이것 하나를 쓴다.** 둘로 적으면 화면에 보이는 기록과 파일에 담긴 기록이 갈리고, 감사 로그는
 * 그 차이를 설명할 사람이 없는 문서다. 기간은 주문 검색과 같은 함수로 읽는다 — KST 로 자르고 끝날을 포함한다.
 * 날짜가 틀리면 OrderSearchError 를 던진다(화면이 그 말을 보여 준다).
 */
export function auditLogWhere(filter: AuditLogFilter) {
  const range = readDateRange(filter.from || undefined, filter.to || undefined);
  return {
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
    ...(filter.targetId ? { targetId: filter.targetId } : {}),
    ...(filter.actor ? { actorId: filter.actor === SYSTEM_ACTOR ? null : filter.actor } : {}),
    ...(range.from || range.until
      ? {
          createdAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.until ? { lt: range.until } : {}),
          },
        }
      : {}),
  };
}

const MAX_TAKE = 50;

export async function getAuditLogs(actor: Actor, query: AuditLogQuery = {}): Promise<AuditLogPage> {
  assertPermission(actor, 'user:read');

  const take = Math.min(query.take ?? 25, MAX_TAKE);

  const where = auditLogWhere(query);

  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
    where,
    // id 를 함께 정렬해야 같은 밀리초에 들어온 행의 순서가 고정된다.
    // 순서가 흔들리면 쪽을 넘길 때 행이 겹치거나 빠진다.
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    skip: offsetOf(query.page ?? 1, take),
    select: {
      id: true, actorRole: true, action: true, targetType: true, targetId: true,
      before: true, after: true, createdAt: true, actorLabel: true,
      actor: { select: { name: true, email: true } },
    },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  // 필터 선택지는 실제로 쌓인 값에서 뽑는다. 상수로 두면 새 동작을 추가할 때
  // 목록에 넣는 것을 잊는다.
  const [actions, targetTypes, actors] = await Promise.all([
    prisma.adminAuditLog.findMany({
      distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' }, take: 100,
    }),
    prisma.adminAuditLog.findMany({
      distinct: ['targetType'], select: { targetType: true }, orderBy: { targetType: 'asc' }, take: 50,
    }),
    prisma.adminAuditLog.findMany({
      distinct: ['actorId'], select: { actorId: true, actor: { select: { name: true, email: true } } }, take: 200,
    }),
  ]);

  return {
    rows: rows.map(toRow),
    total,
    filters: {
      actions: actions.map((a) => a.action),
      targetTypes: targetTypes.map((t) => t.targetType),
      actors: actorOptions(actors),
    },
  };
}

/**
 * 행위자 선택지. 이메일을 함께 적는다 — 운영진끼리 이름이 겹치면 누구를 고른 것인지 모른다.
 * 배치는 사용자가 없어 한 칸("자동 실행")으로 묶어 맨 뒤에 둔다.
 */
function actorOptions(
  rows: readonly { actorId: string | null; actor: { name: string; email: string } | null }[],
): { value: string; label: string }[] {
  const people = rows
    .filter((r): r is { actorId: string; actor: { name: string; email: string } } => r.actorId !== null && r.actor !== null)
    .map((r) => ({ value: r.actorId, label: `${r.actor.name} · ${r.actor.email}` }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  return rows.some((r) => r.actorId === null) ? [...people, { value: SYSTEM_ACTOR, label: '자동 실행' }] : people;
}

/** 한 번에 내려받을 수 있는 기록 수. 넘으면 기간이나 행위자로 좁히라고 답한다 */
export const AUDIT_EXPORT_MAX_ROWS = 5_000;

export class AuditExportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super(
      `내려받을 기록이 ${rows.toLocaleString('ko-KR')}건으로 한도(${AUDIT_EXPORT_MAX_ROWS.toLocaleString('ko-KR')})를 넘습니다. 기간이나 행위자로 좁혀 주세요.`,
    );
    this.name = 'AuditExportTooLargeError';
  }
}

export type AuditLogExportRow = AuditLogRow;

/**
 * 감사 로그 내려받기. 목록과 같은 조건(auditLogWhere), 같은 순서(최근 것부터)다.
 *
 * 한도를 넘으면 **잘라서 주지 않는다.** 앞 5,000건만 담긴 파일은 "이 기간의 기록 전부" 로 읽힌다.
 */
export async function exportAuditLogs(actor: Actor, filter: AuditLogFilter): Promise<AuditLogExportRow[]> {
  assertPermission(actor, 'user:read');
  const where = auditLogWhere(filter);

  const count = await prisma.adminAuditLog.count({ where });
  if (count > AUDIT_EXPORT_MAX_ROWS) throw new AuditExportTooLargeError(count);

  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, actorRole: true, action: true, targetType: true, targetId: true,
      before: true, after: true, createdAt: true, actorLabel: true,
      actor: { select: { name: true, email: true } },
    },
  });
  return rows.map(toRow);
}

function toRow(r: {
  id: string; actorRole: UserRole; action: string; targetType: string; targetId: string;
  before: unknown; after: unknown; createdAt: Date; actorLabel: string | null;
  actor: { name: string; email: string } | null;
}): AuditLogRow {
  return {
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
  };
}
