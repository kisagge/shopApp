import 'server-only';
import { prisma } from '@shop/db';
import {
  dayKeyOf,
  dayWindow,
  daysToRollUp,
  deletableThrough,
  nextDay,
  computeFunnel,
  FUNNEL_STEP,
  type DayKey,
} from '@shop/core';

/**
 * 이벤트 롤업과 보존.
 *
 * 하루가 끝나면 그날치를 집계 행으로 접고, 접힌 지 오래된 원본을 지운다.
 * 순서가 중요하다 — **접은 다음에 지운다.** 반대로 하면 지운 것을 접게 된다.
 */

export interface RollupResult {
  readonly rolledUp: readonly DayKey[];
  readonly rawEvents: number;
  readonly deletedThrough: DayKey | null;
  readonly deletedRows: number;
  /** 삭제를 건너뛴 이유. 정상이면 null */
  readonly deleteSkipped: string | null;
}

/** 'YYYY-MM-DD' → Postgres DATE 컬럼에 넣을 값 (UTC 자정) */
const asDate = (day: DayKey): Date => new Date(`${day}T00:00:00.000Z`);

/**
 * 하루치를 접는다.
 *
 * **여러 번 돌려도 결과가 같아야 한다.** 배치는 재시도되고, 크론은 겹쳐
 * 돌기도 한다. 그래서 증감이 아니라 원본을 다시 세서 덮어쓴다 —
 * 리뷰 평점 집계에서 쓴 것과 같은 이유다. 증감은 한 번 어긋나면
 * 스스로 알아채지 못한다.
 */
async function rollUpDay(day: DayKey): Promise<number> {
  const { start, end } = dayWindow(day);
  const range = { gte: start, lt: end };

  // 이름별 이벤트 수·금액·수량. 고유 세션 수는 집계 함수로 못 얻으므로 따로 센다.
  const totals = await prisma.eventLog.groupBy({
    by: ['name'],
    where: { receivedAt: range },
    _count: { _all: true },
    _sum: { value: true, quantity: true },
  });

  // 이름 × 세션 / 이름 × 사용자 의 고유 조합. groupBy 가 곧 distinct 다.
  const [sessionPairs, userPairs] = await Promise.all([
    prisma.eventLog.groupBy({ by: ['name', 'sessionId'], where: { receivedAt: range } }),
    prisma.eventLog.groupBy({
      by: ['name', 'userId'],
      where: { receivedAt: range, userId: { not: null } },
    }),
  ]);

  const sessionsBy = new Map<string, number>();
  for (const p of sessionPairs) sessionsBy.set(p.name, (sessionsBy.get(p.name) ?? 0) + 1);
  const usersBy = new Map<string, number>();
  for (const p of userPairs) usersBy.set(p.name, (usersBy.get(p.name) ?? 0) + 1);

  // 퍼널은 세션마다 어떤 이벤트를 거쳤는지 알아야 나온다.
  const funnelRows = await prisma.eventLog.groupBy({
    by: ['sessionId', 'name'],
    where: { receivedAt: range, name: { in: [...FUNNEL_STEP] } },
  });
  const namesBySession = new Map<string, string[]>();
  for (const r of funnelRows) {
    const list = namesBySession.get(r.sessionId);
    if (list) list.push(r.name);
    else namesBySession.set(r.sessionId, [r.name]);
  }
  const funnel = computeFunnel(
    [...namesBySession].map(([sessionId, names]) => ({ sessionId, names })),
  );

  const rawEvents = totals.reduce((sum, t) => sum + t._count._all, 0);
  const dayDate = asDate(day);

  // 지우고 다시 넣는다. upsert 로 하면 이번에 사라진 이름의 행이 옛 값으로
  // 남는다 — 예를 들어 그날 이벤트가 잘못 들어와 나중에 정리했을 때.
  await prisma.$transaction([
    prisma.eventDaily.deleteMany({ where: { day: dayDate } }),
    prisma.funnelDaily.deleteMany({ where: { day: dayDate } }),
    prisma.eventDaily.createMany({
      data: totals.map((t) => ({
        day: dayDate,
        name: t.name,
        events: t._count._all,
        sessions: sessionsBy.get(t.name) ?? 0,
        users: usersBy.get(t.name) ?? 0,
        value: t._sum.value ?? 0,
        quantity: t._sum.quantity ?? 0,
      })),
    }),
    prisma.funnelDaily.createMany({
      data: funnel.map((f) => ({ day: dayDate, step: f.step, sessions: f.sessions })),
    }),
    prisma.eventRollup.upsert({
      where: { day: dayDate },
      update: { rawEvents, completedAt: new Date() },
      create: { day: dayDate, rawEvents },
    }),
  ]);

  return rawEvents;
}

/**
 * 배치 한 번.
 *
 * 접을 수 있는 날을 순서대로 접고, 그다음에 보존 기간이 지난 원본을 지운다.
 * 한 날이 실패하면 거기서 멈춘다 — 건너뛰고 다음 날을 접으면 "어디까지
 * 접었는가" 가 연속이 아니게 되고, 그 위에서 삭제 경계를 계산할 수 없다.
 */
export async function runEventRollup(
  now = new Date(),
  options: { readonly retentionDays?: number; readonly maxDays?: number } = {},
): Promise<RollupResult> {
  const [lastRolledUp, oldestRow] = await Promise.all([
    contiguousFrontier(),
    prisma.eventLog.findFirst({ orderBy: { receivedAt: 'asc' }, select: { receivedAt: true } }),
  ]);

  const oldestRaw = oldestRow ? dayKeyOf(oldestRow.receivedAt) : null;

  const days = daysToRollUp({
    lastRolledUp,
    oldestRaw,
    now,
    ...(options.maxDays === undefined ? {} : { maxDays: options.maxDays }),
  });

  const rolledUp: DayKey[] = [];
  let rawEvents = 0;
  for (const day of days) {
    rawEvents += await rollUpDay(day);
    rolledUp.push(day);
  }

  const through = deletableThrough({
    lastRolledUp: rolledUp.at(-1) ?? lastRolledUp,
    now,
    ...(options.retentionDays === undefined ? {} : { retentionDays: options.retentionDays }),
  });

  if (through === null) {
    return {
      rolledUp,
      rawEvents,
      deletedThrough: null,
      deletedRows: 0,
      deleteSkipped: '접힌 날이 없습니다',
    };
  }

  // through 는 "이 날까지 포함해서 지운다" 이므로 다음 날 자정 이전까지.
  const { end } = dayWindow(through);
  const { count } = await prisma.eventLog.deleteMany({ where: { receivedAt: { lt: end } } });

  return {
    rolledUp,
    rawEvents,
    deletedThrough: through,
    deletedRows: count,
    deleteSkipped: null,
  };
}

/**
 * 끊기지 않고 접힌 구간의 마지막 날.
 *
 * **가장 최근에 접은 날이 아니다.** 중간에 빠진 날이 있으면 그 앞에서 멈춘다.
 *
 * 최댓값을 쓰면 두 가지가 한꺼번에 잘못된다. 삭제 쪽은 접힌 적 없는 날의
 * 원본을 지우려 들고, 롤업 쪽은 이미 지나친 구멍을 영영 안 메운다. 그러면
 * 안전장치가 삭제를 영구히 막아 테이블만 계속 자란다.
 *
 * 여기서 멈춰 두면 다음 배치가 구멍부터 다시 접는다. 접는 것은 몇 번을 해도
 * 결과가 같으므로 뒤쪽을 다시 접어도 손해가 없다. **스스로 낫는다.**
 */
async function contiguousFrontier(): Promise<DayKey | null> {
  // DATE 컬럼은 UTC 자정으로 읽히므로 그대로 잘라 쓴다. dayKeyOf 를 통과시키면
  // KST 로 9시간 밀려 하루가 어긋난다.
  const rows = await prisma.eventRollup.findMany({
    orderBy: { day: 'asc' },
    select: { day: true },
  });
  if (rows.length === 0) return null;

  let frontier = rows[0]!.day.toISOString().slice(0, 10);
  for (const row of rows.slice(1)) {
    const day = row.day.toISOString().slice(0, 10);
    if (day !== nextDay(frontier)) break;
    frontier = day;
  }
  return frontier;
}
