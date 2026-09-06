import 'server-only';
import { prisma } from '@shop/db';
import {
  RAW_RETENTION_DAYS, recentMonths, dayKeyOf, WEB_VITAL, rateVital, assertPermission,
  type Actor, type WebVital, type VitalRating,
} from '@shop/core';

// ── 장기 트래픽 추이 (접힌 값) ────────────────────────────────

export interface MonthlyTraffic {
  /** 'YYYY-MM' */
  readonly month: string;
  /** 상품 조회 이벤트 수 */
  readonly viewItems: number;
  /** 장바구니 담기 이벤트 수 */
  readonly addToCarts: number;
  /** 결제 완료 이벤트 수 */
  readonly purchases: number;
  /** 조회 대비 결제 비율(%). 소수 첫째 자리 */
  readonly conversionRate: number;
}

export interface TrafficHistory {
  readonly months: readonly MonthlyTraffic[];
  /** 원본이 남아 있는 가장 이른 날. 이보다 앞은 접힌 값만 있다. */
  readonly rawSince: string;
}

/**
 * 월별 트래픽. **접힌 값(EventDaily)에서 읽는다.**
 *
 * 원본은 90일이 지나면 지워지므로 그보다 긴 구간은 여기서만 볼 수 있다.
 * 이 표가 접힌 값을 읽는 유일한 자리이고, 롤업이 존재하는 이유다.
 *
 * **세션 수를 쓰지 않는다.** 접힌 세션 수는 하루 단위 고유값이라 날짜끼리
 * 더하면 이틀에 걸쳐 온 세션이 두 번 세어진다. 여기서는 날짜끼리 더해도
 * 되는 **이벤트 수**만 쓰고, 전환율도 이벤트 기준이라고 이름에 적는다.
 * 세션 기준 전환율이 필요하면 90일 안쪽에서 퍼널을 봐야 한다.
 */
export async function getTrafficHistory(
  actor: Actor,
  monthCount = 12,
  now: Date = new Date(),
): Promise<TrafficHistory> {
  // 전체 트래픽 지표다. 가맹점에게는 주지 않는다.
  assertPermission(actor, 'analytics:all');

  const months = recentMonths(now, monthCount);
  const oldest = months.at(-1)!;
  const rows = await prisma.eventDaily.findMany({
    where: {
      day: { gte: new Date(`${oldest}-01T00:00:00.000Z`) },
      name: { in: ['view_item', 'add_to_cart', 'purchase'] },
    },
    select: { day: true, name: true, events: true },
  });

  const byMonth = new Map<string, { view_item: number; add_to_cart: number; purchase: number }>();
  for (const month of months) byMonth.set(month, { view_item: 0, add_to_cart: 0, purchase: 0 });

  for (const row of rows) {
    // DATE 컬럼은 UTC 자정으로 저장돼 있고 그 값이 곧 KST 날짜다
    const month = row.day.toISOString().slice(0, 7);
    const bucket = byMonth.get(month);
    if (!bucket) continue;
    bucket[row.name as keyof typeof bucket] += row.events;
  }

  return {
    months: months.map((month) => {
      const b = byMonth.get(month)!;
      return {
        month,
        viewItems: b.view_item,
        addToCarts: b.add_to_cart,
        purchases: b.purchase,
        conversionRate:
          b.view_item === 0 ? 0 : Math.round((b.purchase / b.view_item) * 1000) / 10,
      };
    }),
    rawSince: dayKeyOf(new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000)),
  };
}

export interface VitalSummary {
  readonly metric: WebVital;
  /** 75 백분위. 표본이 없으면 null */
  readonly p75: number | null;
  readonly rating: VitalRating | null;
  readonly samples: number;
}

/**
 * 실사용자 성능.
 *
 * **평균이 아니라 75 백분위로 본다.** 평균은 아주 느린 소수를 빠른 다수에
 * 묻어 버린다. 75 백분위는 "넷 중 셋이 이보다 빨랐다" 는 뜻이라, 느린 쪽이
 * 넷 중 하나를 넘으면 대표값이 그쪽을 가리킨다.
 *
 * 백분위는 DB 에 맡긴다. 값을 전부 읽어 와 코드에서 정렬하면 이벤트가 쌓일수록
 * 그대로 무거워지는데, 이건 매일 열어 보는 화면이다.
 */
export async function getWebVitals(
  actor: Actor,
  days = 28,
  now: Date = new Date(),
): Promise<{ vitals: VitalSummary[]; since: Date }> {
  assertPermission(actor, 'analytics:all');

  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ metric: string; p75: number; samples: bigint }[]>`
    select
      props->>'metric'                                                as metric,
      percentile_cont(0.75) within group (order by (props->>'value')::float) as p75,
      count(*)                                                        as samples
    from event_logs
    where name = 'web_vitals'
      and "receivedAt" >= ${since}
      and props->>'metric' is not null
    group by 1
  `;

  const byMetric = new Map(rows.map((r) => [r.metric, r]));

  return {
    since,
    vitals: WEB_VITAL.map((metric) => {
      const row = byMetric.get(metric);
      // 값이 없으면 null 이다. 0 을 돌려주면 "아주 빠름" 으로 읽힌다.
      const value = row ? Number(row.p75) : null;
      return {
        metric,
        p75: value,
        rating: value === null ? null : rateVital(metric, value),
        samples: row ? Number(row.samples) : 0,
      };
    }),
  };
}
