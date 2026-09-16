import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor } from '@shop/core';

/**
 * 오류함 조회.
 *
 * **전체 플랫폼의 것이라 가맹점에게는 보이지 않는다**(`analytics:all`). 다른 가맹점의 화면에서 난 오류까지 보이고,
 * 스택에는 우리 코드 구조가 그대로 드러난다.
 */

export interface ErrorGroupRow {
  readonly fingerprint: string;
  readonly source: string;
  readonly severity: string;
  readonly name: string;
  readonly message: string;
  readonly stack: string | null;
  readonly routePath: string;
  readonly routeType: string;
  readonly method: string | null;
  readonly path: string | null;
  readonly count: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
}

export interface ErrorGroupList {
  readonly items: readonly ErrorGroupRow[];
  /** 아직 처리하지 않은 것의 수. 메뉴와 머리글이 읽는다 */
  readonly openCount: number;
}

export async function getErrorGroups(
  actor: Actor,
  options: { readonly resolved?: boolean } = {},
): Promise<ErrorGroupList> {
  assertPermission(actor, 'analytics:all');

  const [rows, openCount] = await Promise.all([
    prisma.errorGroup.findMany({
      where: options.resolved === true ? { resolvedAt: { not: null } } : { resolvedAt: null },
      // 최근에 난 것부터 — 어제 한 번 난 것보다 방금 나고 있는 것이 급하다
      orderBy: { lastSeenAt: 'desc' },
      take: 50,
      select: {
        fingerprint: true, source: true, severity: true,
        name: true, message: true, stack: true,
        routePath: true, routeType: true, method: true, path: true,
        count: true, firstSeenAt: true, lastSeenAt: true, resolvedAt: true,
        resolvedBy: { select: { name: true } },
      },
    }),
    prisma.errorGroup.count({ where: { resolvedAt: null } }),
  ]);

  return {
    items: rows.map((r) => ({
      fingerprint: r.fingerprint,
      source: r.source,
      severity: r.severity,
      name: r.name,
      message: r.message,
      stack: r.stack,
      routePath: r.routePath,
      routeType: r.routeType,
      method: r.method,
      path: r.path,
      count: r.count,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      resolvedAt: r.resolvedAt,
      resolvedBy: r.resolvedBy?.name ?? null,
    })),
    openCount,
  };
}

/**
 * 처리했다고 표시하거나 되돌린다.
 *
 * **지우지 않는다.** 처리한 오류도 다시 나면 그때 다시 열리고(core reopensGroup), 그 전에 몇 번 났는지는 그대로
 * 남아 있어야 "고쳤다고 했는데 또 난다" 를 볼 수 있다.
 */
export async function setErrorResolved(
  actor: Actor,
  fingerprint: string,
  resolved: boolean,
): Promise<{ resolvedAt: Date | null }> {
  assertPermission(actor, 'analytics:all');

  const updated = await prisma.errorGroup.update({
    where: { fingerprint },
    data: resolved
      ? { resolvedAt: new Date(), resolvedById: actor.id }
      : { resolvedAt: null, resolvedById: null },
    select: { resolvedAt: true },
  });

  return updated;
}
