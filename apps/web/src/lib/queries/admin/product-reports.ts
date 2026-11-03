import 'server-only';
import { prisma } from '@shop/db';
import {
  productReportPriority, productReportState,
  type Actor, type ProductReportReason, type ProductReportState,
} from '@shop/core';
import { assertAdminQuery } from './scope';

/**
 * 상품 신고 대기줄.
 *
 * **운영진만 본다.** 가맹점에게는 `product:moderate` 가 없다 — 신고의 대상이 파는 쪽인데
 * 그 쪽이 자기 건을 닫을 수 있으면 신고가 운영진에게 닿지 않는다. 범위를 좁히는 대신
 * 권한으로 막는 것이라 `merchantScope` 를 쓰지 않는다.
 *
 * **신고를 읽어 상품으로 모은다.** 상품을 먼저 읽으면 "가장 오래 기다린 신고" 순으로
 * 자를 수가 없다 — 그 값은 상품 행에 없다. 그래서 신고를 오래된 순으로 자르고 메모리에서
 * 모은다. 리뷰 신고 대기줄이 같은 모양이고, 그 자리에 적어 둔 대가도 같다.
 */

/**
 * 한 번에 훑는 신고 수.
 *
 * **점수는 SQL 로 못 매긴다**(사유별 최댓값 + 건수). 그래서 가져와 메모리에서 세우는데,
 * 그러면 **DB 에서 자르는 방향이 무엇이 보이느냐를 정한다.** 최신순으로 자르면 신고가
 * 몰리는 날에 가장 오래 기다린 것이 통째로 밀려난다 — 리뷰 신고 대기줄이 실제로 그랬다.
 * 오래된 쪽을 남긴다. 대가도 같다: 상한을 넘는 동안 갓 들어온 높은 점수가 창 밖에 머문다.
 * 그래도 이쪽이 낫다 — 점수는 처리하면 사라지지만 밀려난 신고는 영영 밀린다.
 */
const QUEUE_CAP = 200;

export type ProductReportTab = 'open' | 'done';

export interface ProductReportEntry {
  readonly id: string;
  readonly reason: ProductReportReason;
  readonly detail: string | null;
  readonly reporterName: string;
  readonly createdAt: Date;
  readonly resolvedAt: Date | null;
  readonly resolution: string | null;
}

export interface ProductReportRow {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly archived: boolean;
  readonly state: ProductReportState;
  readonly openReports: number;
  readonly reports: readonly ProductReportEntry[];
  readonly priority: number;
  /** 이 상품에서 가장 오래 기다린 미처리 신고 — 같은 점수일 때 순서를 가른다 */
  readonly waitingSince: Date;
}

export interface ProductReportQueue {
  readonly rows: readonly ProductReportRow[];
  /** 상한에 걸려 창 밖에 남은 것이 있는가 — 화면이 그 사실을 적는다 */
  readonly truncated: boolean;
}

/** 신고자도 사람이다. 운영진에게도 이름을 통째로 보여 줄 이유가 없다. */
function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length <= 1) return trimmed;
  return `${trimmed[0]}${'○'.repeat(trimmed.length - 1)}`;
}

export async function getProductReportQueue(
  actor: Actor,
  query: { tab?: ProductReportTab } = {},
): Promise<ProductReportQueue> {
  assertAdminQuery(actor, 'product:moderate');

  const tab = query.tab ?? 'open';
  const open = tab === 'open';

  const rows = await prisma.productReport.findMany({
    where: open ? { resolvedAt: null } : { resolvedAt: { not: null } },
    /*
     * 대기줄은 오래 기다린 것부터(위 주석). **끝난 목록은 반대다** — 거기서는 방금 처리한
     * 것이 위에 와야 하고, 그 줄들은 누가 처리하기를 기다리고 있지 않다.
     */
    orderBy: open ? { createdAt: 'asc' } : { resolvedAt: 'desc' },
    take: QUEUE_CAP + 1,
    select: {
      id: true, reason: true, detail: true, createdAt: true,
      resolvedAt: true, resolution: true,
      reporter: { select: { name: true } },
      product: { select: { id: true, name: true, slug: true, deletedAt: true } },
    },
  });

  const truncated = rows.length > QUEUE_CAP;
  const scanned = truncated ? rows.slice(0, QUEUE_CAP) : rows;

  const byProduct = new Map<string, { row: (typeof scanned)[number]['product']; entries: typeof scanned }>();
  for (const report of scanned) {
    const bucket = byProduct.get(report.product.id);
    if (bucket) bucket.entries.push(report);
    else byProduct.set(report.product.id, { row: report.product, entries: [report] });
  }

  const grouped: ProductReportRow[] = [...byProduct.values()].map(({ row, entries }) => {
    const unresolved = entries.filter((e) => e.resolvedAt === null);
    return {
      productId: row.id,
      productName: row.name,
      productSlug: row.slug,
      archived: row.deletedAt !== null,
      state: productReportState({
        archived: row.deletedAt !== null,
        openReports: unresolved.length,
        totalReports: entries.length,
      }),
      openReports: unresolved.length,
      reports: entries.map((e) => ({
        id: e.id,
        reason: e.reason,
        detail: e.detail,
        reporterName: maskName(e.reporter.name),
        createdAt: e.createdAt,
        resolvedAt: e.resolvedAt,
        resolution: e.resolution,
      })),
      priority: productReportPriority(unresolved),
      waitingSince: entries.reduce(
        (oldest, e) => (e.createdAt < oldest ? e.createdAt : oldest),
        entries[0]!.createdAt,
      ),
    };
  });

  /*
   * 점수가 높은 쪽이 먼저. **같은 점수면 오래 기다린 쪽이 먼저다** — 그 말을 적지 않으면
   * Map 의 들어온 순서가 순서를 정하게 되고, 그것은 우연이다.
   */
  grouped.sort((a, b) => b.priority - a.priority || a.waitingSince.getTime() - b.waitingSince.getTime());

  return { rows: grouped, truncated };
}
